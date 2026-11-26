import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {previaMoedas,aguardandoConferencia} from '../previa-moedas.mjs';
const admin=fs.readFileSync('admin.html','utf8');
test('prévia espelha exatamente o bônus atual do admin em cada faixa e indicação',async()=>{
 const start=admin.indexOf(' let bonusISC = Math.round(dados.valor);'),end=admin.indexOf(' const camposUsuario =',start);
 const code=admin.slice(start,end)+'\nreturn bonusISC;';
 for(const diferenca of [-40,-30,-29,-15,-14,-10,-9,-5,-4,-1,0,1])for(const indicado of [false,true])for(const final of [false,true]){
  const parcela={valor:270,vencimento:new Date(2026,10,30)},emprestimo={parcelas:final?1:2,parcelasPagas:0},cliente={indicadoPor:indicado?'u2':null};
  const context={dados:{valor:270,emprestimoId:'x'},diasDiferenca:diferenca,userData:cliente,db:{},doc:()=>({}),getDoc:async()=>({exists:()=>true,data:()=>emprestimo})};
  const atual=await vm.runInNewContext('(async()=>{'+code+'})()',context);
  assert.equal(previaMoedas(parcela,emprestimo,cliente,new Date(2026,10,30+diferenca)).total,atual);
 }
});
test('aviso persiste até conferência e desaparece após baixa integral ou parcial posterior',()=>{
 const p={valor:270,pago:0,pagamentoInformadoEm:new Date('2026-11-26T10:00Z')};
 assert.equal(aguardandoConferencia(p),true);
 assert.equal(aguardandoConferencia({...p,status:'pago'}),false);
 assert.equal(aguardandoConferencia({...p,pago:270}),false);
 assert.equal(aguardandoConferencia({...p,ultimaDataPagamento:new Date('2026-11-26T11:00Z')}),false);
 assert.equal(aguardandoConferencia({valor:270,pago:0}),false);
});
test('informar pagamento grava apenas o aviso e a notificação; repetição não duplica',async()=>{
 const source=fs.readFileSync('functions/index.js','utf8');const a=source.indexOf('exports.registrarEventoCliente = onCall('),b=source.indexOf('// Admin aprova',a);
 const writes=[];let data={userId:'u1',valor:270,pago:0};const ref={get:async()=>({exists:true,data:()=>data})};
 const db={collection:name=>({doc:id=>name==='parcelas'?ref:{id:'aviso'}}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>data}),update:(r,patch)=>{writes.push(patch);data={...data,...patch};},set:(r,d)=>writes.push(d)})};
 const ctx={exports:{},onCall:(opts,fn)=>fn,HttpsError:class extends Error{},getFirestore:()=>db,exigirContaAprovada:async()=>{},FieldValue:{serverTimestamp:()=>({toMillis:()=>1000})},alertaTelegram:(uid,tipo,id)=>({uid,tipo,id})};
 vm.runInNewContext(source.slice(a,b),ctx);
 const request={auth:{uid:'u1'},data:{tipo:'pagamento_confirmado',dados:{id:'p1'}}};
 await ctx.exports.registrarEventoCliente(request);assert.equal(writes.length,2);assert.deepEqual(Object.keys(writes[0]),['pagamentoInformadoEm']);
 await ctx.exports.registrarEventoCliente(request);assert.equal(writes.length,2);
 data={...data,userId:'outro'};await assert.rejects(ctx.exports.registrarEventoCliente(request));assert.equal(writes.length,2);
});
