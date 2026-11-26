import test from 'node:test';
import {prepararQuitacaoAtomica} from '../quitacao-atomica.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {previaPagamentoReal,distribuirRecebimentoReal,salvarPagamentoConferido} from '../conferencia-pagamento.mjs';
import {totalRecebidoParcela} from '../cobranca-parcela.mjs';
import {resumoHistorico} from '../historico-cliente.mjs';
const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
function fixture(pais='BR'){
 const parcel={valor:350,pago:0,restante:350,status:'pendente',emprestimoId:'e',userId:'u',numero:1,vencimento:new Date('2026-11-24T12:00:00Z')},loan={id:'e',parcelas:1,parcelasPagas:0,pais,status:'ativo',userId:'u',valor:1000,valorFinal:1300};
 const records=new Map([['admins/a',{}],['usuarios/u',{isaCoins:0}],['parcelas/p',parcel],['emprestimos/e',loan],['configuracoes/financeiro',{impactoCaixaBR:500,impactoCaixaPT:400}]]),writes=[];
 const ctx={prepararQuitacaoAtomica,db:{},auth:{currentUser:{uid:'a'}},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>1,increment:v=>({__increment:v}),distribuirRecebimentoReal};
 ctx.runTransaction=async(_,fn)=>{
  const staged=[];let writing=false;
  await fn({get:async ref=>{assert.equal(writing,false);return {exists:()=>records.has(ref),data:()=>records.get(ref)};},set:(ref,value,options)=>{writing=true;staged.push([ref,value,options?.merge===true]);},update:(ref,value)=>{writing=true;staged.push([ref,value,true]);}});
  for(const [ref,value,merge] of staged){const next=merge?{...records.get(ref)}:{};for(const [key,v] of Object.entries(value))next[key]=v?.__increment!==undefined?Number(next[key]||0)+v.__increment:v;records.set(ref,next);writes.push(ref);}
 };
 vm.createContext(ctx);
 const apiStart=html.indexOf('const apiConferenciaPagamento ='),apiEnd=html.indexOf('const historicoCompletoCliente',apiStart);
 const helpersStart=html.indexOf('const PERCENTUAL_EVELYN ='),helpersEnd=html.indexOf('// Usado no feed',helpersStart);
 vm.runInContext(html.slice(helpersStart,helpersEnd)+html.slice(apiStart,apiEnd),ctx);
 return {api:vm.runInContext('apiConferenciaPagamento',ctx),records,writes,parcel,loan};
}
async function save(f,preview,id,now){
 const current=f.records.get('parcelas/p');
 await salvarPagamentoConferido(f.api,{parcelaId:'p',parcel:current,loan:f.loan},preview,{pago:preview.novoPago,restante:preview.saldoContratual,...(preview.mode==='confirmar'?{status:'pago'}:{})},id,now);
}
test('rotina real do admin: bruto374,50, Caixa337,05 e Evelyn37,45 uma única vez',async()=>{
 const f=fixture(),now=new Date('2026-11-26T12:00:00Z');
 const p=previaPagamentoReal(f.parcel,f.loan,{valor:374.5,juros:7,multa:17.5,dataReal:'2026-11-26'},'confirmar',now);
 await save(f,p,'a',now);
 const cash=f.records.get('configuracoes/financeiro');assert.equal(cash.impactoCaixaBR,837.05);assert.equal(cash.repasseEvelynBR,37.45);assert.equal(cash.impactoCaixaPT,400);
 const paid=f.records.get('parcelas/p'),summary=resumoHistorico({pais:'BR',score:45},[f.loan],[paid],now);
 assert.equal(summary.totais.BR.recebido,374.5);assert.equal(summary.totais.BR.juros,7);assert.equal(summary.totais.BR.multa,17.5);assert.equal(totalRecebidoParcela(paid),374.5);
 assert.equal(f.records.get('historicoPagamentos/a').valorRecebido,374.5);assert.equal(f.writes.filter(k=>k==='configuracoes/financeiro').length,1);
 await assert.rejects(salvarPagamentoConferido(f.api,{parcelaId:'p',parcel:f.parcel,loan:f.loan},p,{pago:350,restante:0,status:'pago'},'a',now));assert.equal(f.records.get('configuracoes/financeiro').impactoCaixaBR,837.05);
});
test('dois recebimentos parciais não repetem encargos, nem somam extrato novamente ao Caixa',async()=>{
 const f=fixture(),day1=new Date('2026-11-26T12:00:00Z'),day2=new Date('2026-11-27T12:00:00Z');
 const first=previaPagamentoReal(f.parcel,f.loan,{valor:100,juros:7,multa:17.5,dataReal:'2026-11-26'},'parcial',day1);await save(f,first,'a',day1);
 const partial=f.records.get('parcelas/p'),last=previaPagamentoReal(partial,f.loan,{valor:278,juros:3.5,multa:0,dataReal:'2026-11-27'},'confirmar',day2);await save(f,last,'b',day2);
 const paid=f.records.get('parcelas/p'),cash=f.records.get('configuracoes/financeiro');
 assert.equal(totalRecebidoParcela(paid),378);assert.equal(paid.jurosPagos,10.5);assert.equal(paid.multaPaga,17.5);assert.equal(cash.impactoCaixaBR,840.2);assert.equal(cash.repasseEvelynBR,37.8);
 assert.equal(f.records.get('historicoPagamentos/a').valorRecebido+f.records.get('historicoPagamentos/b').valorRecebido,378);
 const before=JSON.stringify(cash);for(let i=0;i<3;i++)assert.equal(resumoHistorico({pais:'BR',score:45},[f.loan],[paid],day2).totais.BR.recebido,378);assert.equal(JSON.stringify(cash),before);
});
test('Portugal usa só o Caixa e a moeda correspondentes',async()=>{
 const f=fixture('PT'),now=new Date('2026-11-26T12:00:00Z'),preview=previaPagamentoReal(f.parcel,f.loan,{valor:374.5,juros:7,multa:17.5,dataReal:'2026-11-26'},'confirmar',now);await save(f,preview,'pt',now);
 const cash=f.records.get('configuracoes/financeiro');assert.equal(cash.impactoCaixaPT,737.05);assert.equal(cash.impactoCaixaBR,500);assert.equal(cash.repasseEvelynPT,37.45);
});
