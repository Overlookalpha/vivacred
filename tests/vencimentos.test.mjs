import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,parseDate,dateKey,canEdit,savePlan,signature} from '../vencimentos.mjs';

const now=()=>new Date('2026-10-22T12:00:00Z');
const loan={userId:'cliente-teste',pais:'BR',status:'ativo',valor:900,valorFinal:1200,parcelas:3,parcelasPagas:0};
function rows(){return [1,2,3].map((n)=>({id:'p'+n,emprestimoId:'e1',userId:loan.userId,numero:n,valor:400,pago:0,restante:400,status:'pendente',vencimento:parseDate(['2026-11-10','2026-12-10','2027-01-10'][n-1])}));}
const bulk={loanId:'e1',mode:'day',day:15};
function apiFor(data=rows(),otherLoan=loan,admin=true){
 const records=new Map([['admins/admin',admin?{}:null],['emprestimos/e1',structuredClone(otherLoan)],...data.map(r=>['parcelas/'+r.id,(()=>{const {id,...d}=r;return d;})()])]);
 let writes=[],writeStarted=false;
 const api={db:{},doc:(_,collection,id)=>collection+'/'+id,serverTimestamp:()=>({serverTimestamp:true}),records,
  runTransaction:async (_,fn)=>{
   writes=[];writeStarted=false;
   const tx={get:async ref=>{assert.equal(writeStarted,false,'all reads before writes');const value=records.get(ref);return {exists:()=>value!=null,data:()=>structuredClone(value)};},update:(ref,patch)=>{writeStarted=true;writes.push({ref,patch});},set:(ref,value)=>{writeStarted=true;writes.push({ref,value});}};
   const out=await fn(tx);
   for(const w of writes)records.set(w.ref,w.patch?{...records.get(w.ref),...w.patch}:w.value);
   api.writes=writes;return out;
  }};return api;
}
function expected(data=rows()){return {loan,rows:data.map(({id,...data})=>({id,data}))};}

test('edita uma parcela e preserva mês/valores das demais',()=>{
 const data=rows(),original=signature(data);const p=makePlan(data,loan,{loanId:'e1',mode:'single',parcelId:'p2',date:'2026-12-18'},now());
 assert.equal(p.changes.length,1);assert.equal(p.changes[0].after,'2026-12-18');assert.equal(signature(data),original);
});
test('troca dia de todas as futuras mantendo os meses',()=>{
 const p=makePlan(rows(),loan,bulk,now());assert.deepEqual(p.changes.map(c=>c.after),['2026-11-15','2026-12-15','2027-01-15']);
});
test('dia 31 ajusta fevereiro comum, bissexto e meses de 30 dias',()=>{
 for(const [year,end] of [[2027,28],[2028,29]]){
  const data=rows().slice(0,1);data[0].vencimento=parseDate(`${year}-02-10`);
  const p=makePlan(data,loan,{...bulk,day:31},now());assert.equal(p.changes[0].after,`${year}-02-${end}`);assert.equal(p.changes[0].adjusted,true);
 }
 assert.equal(makePlan(rows(),loan,{...bulk,day:31},now()).changes[0].after,'2026-11-30');
});
test('bloqueia datas inválidas, passadas, hoje e inversão de parcelas',()=>{
 for(const date of ['2026-02-30','2026-10-21','2026-10-22','2027-01-12']){
  assert.throws(()=>makePlan(rows(),loan,{loanId:'e1',mode:'single',parcelId:'p2',date},now()));
 }
 for(const day of [0,32,1.5,NaN])assert.throws(()=>makePlan(rows(),loan,{...bulk,day},now()));
});
test('não altera quitadas, parciais, vencidas, hoje, perdas ou acordos',()=>{
 for(const patch of [{pago:400},{pago:1},{status:'pago'},{status:'perdido'},{acordoAtivo:true},{vencimento:parseDate('2026-10-21')},{vencimento:parseDate('2026-10-22')}]){
  const row={...rows()[0],...patch};assert.equal(canEdit(row,'2026-10-22','BR'),false);
  assert.throws(()=>makePlan([row],loan,{loanId:'e1',mode:'single',parcelId:'p1',date:'2026-11-15'},now()));
 }
});
test('o lote ignora parcelas inelegíveis sem reescrevê-las',()=>{
 const data=rows();data[0].pago=400;const p=makePlan(data,loan,bulk,now());assert.equal(p.skipped,1);assert.deepEqual(p.changes.map(c=>c.id),['p2','p3']);
});
test('vínculos, duplicidade, empréstimo encerrado e dados ruins são bloqueados',()=>{
 for(const update of [{emprestimoId:'outro'},{userId:'outra-pessoa'},{numero:0}]){const data=rows();Object.assign(data[0],update);assert.throws(()=>makePlan(data,loan,bulk,now()));}
 assert.throws(()=>makePlan([...rows(),rows()[0]],loan,bulk,now()));
 assert.throws(()=>makePlan(rows(),{...loan,finalizado:true},bulk,now()));
 assert.throws(()=>makePlan(rows(),loan,{...bulk,day:10},now()),/já são/);
});
test('datas de calendário permanecem corretas em BR e PT nas mudanças de horário',()=>{
 for(const country of ['BR','PT'])for(const key of ['2026-10-25','2027-03-28','2028-02-29'])assert.equal(dateKey(parseDate(key),country),key);
});
test('transação grava apenas datas, metadados e histórico, preservando finanças',async()=>{
 const data=rows(),api=apiFor(data),p=makePlan(data,loan,bulk,now());const before=signature(api.records.get('emprestimos/e1'));
 assert.equal(await savePlan(api,expected(data),p,'admin','Pedido do cliente','teste-op',now),3);
 assert.equal(signature(api.records.get('emprestimos/e1')),before);
 for(const w of api.writes.filter(w=>w.patch))assert.deepEqual(Object.keys(w.patch).sort(),['ultimaAlteracaoVencimento','vencimento']);
 const audit=api.records.get('alteracoesVencimento/teste-op');assert.equal(audit.alteracoes.length,3);assert.equal(audit.por,'admin');assert.equal(audit.motivo,'Pedido do cliente');
 for(const r of data){const after=api.records.get('parcelas/'+r.id);for(const key of ['valor','pago','restante','status'])assert.equal(after[key],r[key]);}
 await assert.rejects(savePlan(api,expected(data),p,'admin','Repetição','teste-op',now),/já foi registrada/);
});
test('pagamento concorrente cancela todo o lote antes de qualquer gravação',async()=>{
 const data=rows(),api=apiFor(data),p=makePlan(data,loan,bulk,now());api.records.get('parcelas/p2').pago=100;
 const original=signature([...api.records]);await assert.rejects(savePlan(api,expected(data),p,'admin','Motivo','concorrente',now),/recebeu pagamento/);assert.equal(signature([...api.records]),original);
});
test('exige admin, motivo e revalidação do empréstimo e da data atual',async()=>{
 const data=rows(),p=makePlan(data,loan,bulk,now());
 await assert.rejects(savePlan(apiFor(data,loan,false),expected(data),p,'admin','Motivo','no-admin',now),/administrativo/);
 await assert.rejects(savePlan(apiFor(data),expected(data),p,'admin',' ','no-reason',now),/motivo/);
 await assert.rejects(savePlan(apiFor(data,{...loan,valor:1000}),expected(data),p,'admin','Motivo','changed',now),/empréstimo mudou/);
 await assert.rejects(savePlan(apiFor(data),expected(data),p,'admin','Motivo','midnight',()=>new Date('2026-11-15T15:00:00Z')),/futura|prévia mudou/);
});
