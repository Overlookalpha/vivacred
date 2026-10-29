import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,runInNewContext} from 'node:vm';
import {registrarPagamentoSaque} from '../saque-pagamento.mjs';
const {reservar}=createRequire(import.meta.url)('../functions/lib/isaCoins.js');
test('função real solicitarSaque: autenticação, reserva atômica e pedido duplicado',async()=>{
 const source=await readFile(new URL('../functions/index.js',import.meta.url),'utf8');
 const localRequire=createRequire(new URL('../functions/index.js',import.meta.url));
 const rows=new Map([['usuarios/u1',{isaCoins:10020,pais:'BR',pix:'TESTE-SINTETICO'}]]);
 let serial=Promise.resolve(),sequence=0;
 const db={collection(name){return {doc(id){return {key:name+'/'+(id??'new'+(++sequence))};},where(){return {where(){return {limit(){return {pending:true};}};}};}};},
 runTransaction(fn){const result=serial.then(async()=>{const changes=[];const tx={
  get:async ref=>ref.pending?{empty:![...rows.entries()].some(([k,v])=>k.startsWith('saques/')&&v.status==='pendente')}:{exists:rows.has(ref.key),data:()=>rows.get(ref.key)},
  update:(ref,value)=>changes.push([ref.key,{...rows.get(ref.key),...value}]),create:(ref,value)=>changes.push([ref.key,value])};
  const answer=await fn(tx);for(const [key,value]of changes)rows.set(key,value);return answer;
 });serial=result.catch(()=>{});return result;}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const exported={};runInNewContext(source,{exports:exported,require(name){
  if(name==='firebase-functions/v2/https')return {onCall:(_,fn)=>fn,HttpsError};
  if(name==='firebase-admin/firestore')return {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>123}};
  if(name==='firebase-admin/app')return {getApps:()=>[{}],initializeApp(){}};
  return localRequire(name);
 }});
 await assert.rejects(exported.solicitarSaque({}),e=>e.code==='unauthenticated');
 const outcomes=await Promise.allSettled([exported.solicitarSaque({auth:{uid:'u1'}}),exported.solicitarSaque({auth:{uid:'u1'}})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(rows.get('usuarios/u1').isaCoins,20);assert.equal(rows.get('usuarios/u1').isaCoinsReservadas,10000);
 const withdrawal=[...rows.entries()].find(([k])=>k.startsWith('saques/'))[1];assert.equal(withdrawal.isaCoins,10000);assert.equal(withdrawal.valor,100);assert.equal(withdrawal.moedasReservadas,true);
});
test('10020 moedas: reserva10000, paga100 reais, mantém20 moedas/R$0,20',()=>{
 const r=reservar({isaCoins:10020,pais:'BR'});assert.equal(r.moedas,10000);assert.equal(r.valor,100);assert.equal(r.saldo,20);assert.equal(r.saldo*.01,.20);
});
test('um lote por solicitação, sobras e Portugal preservados',()=>{
 assert.equal(reservar({isaCoins:25000}).saldo,15000);assert.equal(reservar({isaCoins:10000,pais:'PT'}).valor,20);
 for(const n of [9999,-1,NaN,Infinity,10000.1,'10020'])assert.throws(()=>reservar({isaCoins:n}));
});
function harness({reserved=true,status='pendente',saldo=20,reserva=10000,moedas=10000,valor=100,missing=false}={}){
 const rows=new Map([['saques/s1',{userId:'u1',pais:'BR',status,isaCoins:moedas,valor,...(reserved?{moedasReservadas:true,versaoMoedas:2}:{})}],['usuarios/u1',{isaCoins:saldo,isaCoinsReservadas:reserva}]]);
 if(missing)rows.delete('usuarios/u1');
 let writes=0,tail=Promise.resolve();
 const args={db:{},id:'s1',doc:(_,...parts)=>parts.join('/'),increment:n=>({inc:n}),serverTimestamp:()=>123,
 runTransaction:(_db,fn)=>{const call=tail.then(async()=>{
   const staged=[];const tx={get:async key=>({exists:()=>rows.has(key),data:()=>structuredClone(rows.get(key))}),update:(k,v)=>staged.push([k,v]),set:(k,v)=>staged.push([k,v])};
   const result=await fn(tx);for(const [k,v]of staged){rows.set(k,{...rows.get(k),...v});writes++;}return result;
 });tail=call.catch(()=>{});return call;}};
 return {rows,args,get writes(){return writes;}};
}
test('pagamento liquida reserva sem debitar20 moedas restantes',async()=>{
 const h=harness();await registrarPagamentoSaque(h.args);assert.deepEqual(h.rows.get('usuarios/u1'),{isaCoins:20,isaCoinsReservadas:0,isaCoinsSacadas:10000});assert.equal(h.rows.get('saques/s1').status,'pago');assert.equal(h.rows.get('movimentacoesCaixa/saque-s1').valor,-100);
});
test('cliques concorrentes e repetidos não duplicam débito ou caixa (adaptador serializado)',async()=>{
 const h=harness();const r=await Promise.all([registrarPagamentoSaque(h.args),registrarPagamentoSaque(h.args)]);assert.equal(r.filter(x=>x.jaPago).length,1);assert.equal(h.writes,4);await registrarPagamentoSaque(h.args);assert.equal(h.writes,4);
});
test('pedido legado debita somente na baixa, preservando valor original',async()=>{
 const h=harness({reserved:false,saldo:10020,reserva:0});await registrarPagamentoSaque(h.args);assert.equal(h.rows.get('usuarios/u1').isaCoins,20);
});
test('erros não permitem gravações parciais',async()=>{
 for(const options of [{missing:true},{reserva:9999},{reserved:false,saldo:10},{status:'cancelado'},{valor:99},{moedas:10020}]){
  const h=harness(options);await assert.rejects(registrarPagamentoSaque(h.args));assert.equal(h.writes,0);
 }
});
test('saque antigo já pago não sofre acerto automático',async()=>{
 const h=harness({reserved:false,status:'pago',saldo:10020});assert.equal((await registrarPagamentoSaque(h.args)).jaPago,true);assert.equal(h.rows.get('usuarios/u1').isaCoins,10020);assert.equal(h.writes,0);
});
test('renderização cliente: saldo20 equivale R$0,20 e cotação PT preservada',async()=>{
 const html=await readFile(new URL('../home.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('function atualizarSaldoIsaCoins(data){'),html.indexOf('onAuthStateChanged(auth, async (user) => {'));
 const elements=new Map();const context={isaCoinsGlobal:0,document:{getElementById(id){if(!elements.has(id))elements.set(id,{classList:{remove(){}}});return elements.get(id);}}};
 runInNewContext(fn+';atualizarSaldoIsaCoins({isaCoins:20,pais:"BR"});',context);
 assert.equal(context.isaCoinsGlobal,20);assert.equal(elements.get('isaCoinsSaldo').innerText,'20 ISC');assert.match(elements.get('isaCoinsValor').innerHTML,/0,20/);assert.equal(elements.get('faltamIsaCoins').innerText,'9.980 ISC');
 runInNewContext('atualizarSaldoIsaCoins({isaCoins:10000,pais:"PT"});',context);assert.match(elements.get('isaCoinsValor').innerHTML,/20,00/);
});
test('integração fonte: reserva e pedido na mesma transação; saldo realtime; JS válido',async()=>{
 const source=await readFile(new URL('../functions/index.js',import.meta.url),'utf8');assert.match(source,/tx.update\(userRef, \{ isaCoins: reserva.saldo/);assert.match(source,/moedasReservadas: true/);
 for(const name of ['home.html','admin.html']){
  const html=await readFile(new URL('../'+name,import.meta.url),'utf8');
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new SourceTextModule(m[1]);
  if(name==='home.html'){assert.match(html,/onSnapshot\(userRef/);assert.match(html,/minimoSaqueIsaCoin.toLocaleString/);}
  else {assert.match(html,/await registrarPagamentoSaque/);assert.doesNotMatch(html,/Math.max\(0, saldoAtual - \(dados.isaCoins/);}
 }
});
