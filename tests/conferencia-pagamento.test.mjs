import test from 'node:test';
import assert from 'node:assert/strict';
import {previaPagamento,valorPagamento,salvarPagamentoConferido} from '../conferencia-pagamento.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const now=new Date('2026-11-26T12:00:00Z'),parcel={valor:350,pago:100,restante:250,status:'pendente',emprestimoId:'e',userId:'u',numero:1,vencimento:new Date('2026-11-24T12:00:00Z')},loan={pais:'BR',status:'ativo',userId:'u',valor:1000,valorFinal:1300};
const expected={parcelaId:'p',parcel,loan};
test('prévia preserva regras, separa encargos calculados e não inventa desconto',()=>{
 const before=structuredClone(parcel),r=previaPagamento(parcel,loan,100,'parcial',now,now);
 assert.equal(r.recebido,100);assert.equal(r.novoPago,200);assert.equal(r.saldoContratual,150);
 assert.equal(r.jurosCalculados,7);assert.equal(r.multaCalculada,17.5);assert.equal(r.encargosFora,24.5);assert.equal(r.totalAtualizado,274.5);assert.equal(r.descontoNovo,0);assert.deepEqual(parcel,before);
});
test('confirma apenas o saldo restante e respeita acordo sem encargos e desconto anterior',()=>{
 const p={...parcel,acordoAtivo:true,acordoSemEncargos:true,restanteAntesAcordo:300,valorAcordado:250};
 const r=previaPagamento(p,loan,250,'confirmar',now,now);assert.equal(r.saldoContratual,0);assert.equal(r.descontoAcordo,50);assert.equal(r.encargosFora,0);
 assert.throws(()=>previaPagamento(p,loan,200,'confirmar',now,now));
});
test('normaliza vírgula, rejeita NaN, negativos, excesso e datas futuras',()=>{
 assert.equal(valorPagamento('100,50'),100.5);
 for(const v of ['NaN','-1','1,234','1.000,00','Infinity',''])assert.throws(()=>valorPagamento(v));
 assert.throws(()=>previaPagamento(parcel,loan,251,'parcial',now,now));
 assert.throws(()=>previaPagamento(parcel,loan,100,'parcial',new Date('2026-11-27T12:00:00Z'),now));
 for(const status of ['pago','perdido','cancelado'])assert.throws(()=>previaPagamento({...parcel,status},loan,100,'parcial',now,now));
});
function fixture({admin=true,changed=false}={}){
 const records=new Map([['admins/a',admin?{}:null],['parcelas/p',{...parcel,pago:changed?120:100}],['emprestimos/e',loan]]),writes=[];
 const api={db:{},auth:{currentUser:{uid:'a'}},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>({serverTime:true}),aplicarFinanceiro:(tx,value)=>tx.set('configuracoes/financeiro',{valor:value}),runTransaction:async(_,fn)=>{
  const staged=[];let writing=false;
  const result=await fn({get:async ref=>{assert.equal(writing,false);return {exists:()=>records.get(ref)!=null,data:()=>records.get(ref)};},set:(ref,v)=>{writing=true;staged.push([ref,v,false]);},update:(ref,v)=>{writing=true;staged.push([ref,v,true]);}});
  for(const [ref,v,merge] of staged){records.set(ref,merge?{...records.get(ref),...v}:v);writes.push([ref,v]);}return result;
 }};return {api,records,writes};
}
test('salva parcela, financeiro e comprovativo da conferência na mesma transação',async()=>{
 const f=fixture(),preview=previaPagamento(parcel,loan,100,'parcial',now,now);
 await salvarPagamentoConferido(f.api,expected,preview,{pago:200,restante:150},'op',now);
 assert.equal(f.records.get('parcelas/p').pago,200);assert.equal(f.records.get('configuracoes/financeiro').valor,100);
 const audit=f.records.get('historicoPagamentos/op');assert.equal(audit.valorRecebido,100);assert.equal(audit.jurosCalculados,7);assert.equal(audit.encargosDiscriminadosNoRecebimento,false);assert.equal(audit.saldoDepois,150);
 await assert.rejects(salvarPagamentoConferido(f.api,expected,preview,{pago:200,restante:150},'op',now));assert.equal(f.writes.length,3);
});
test('mudança durante conferência, falta de admin e divergência não debitam nem creditam',async()=>{
 const preview=previaPagamento(parcel,loan,100,'parcial',now,now);
 for(const config of [{admin:false},{changed:true}]){const f=fixture(config);await assert.rejects(salvarPagamentoConferido(f.api,expected,preview,{pago:200,restante:150},'op',now));assert.equal(f.writes.length,0);}
 const f=fixture();await assert.rejects(salvarPagamentoConferido(f.api,expected,preview,{pago:250,restante:100},'op',now));assert.equal(f.writes.length,0);
});
test('confirmação de saldo já registado não cria novo recebimento',()=>{
 const p={...parcel,pago:350,restante:0};const r=previaPagamento(p,loan,0,'confirmar',now,now);assert.equal(r.recebido,0);assert.equal(r.saldoContratual,0);
});
test('cancelar a conferência não grava; cliques repetidos não abrem dois fluxos',async()=>{
 const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('window.adicionarPagamento = async'),html.indexOf('window.confirmarParcela = async'));
 let reviewed=0,saved=0,release;
 const ctx={window:{},pagamentosEmAndamento:new Set(),prompt:()=> '100,00',valorPagamento,previaPagamento,Date,doc:(_,c)=>c,db:{},getDocFromServer:async ref=>({exists:()=>true,data:()=>ref==='parcelas'?parcel:loan}),calcularDistribuicaoPagamento:()=>({}),solicitarPagamentoReal:()=>{reviewed++;return new Promise(resolve=>release=resolve);},salvarPagamentoConferido:()=>{saved++;},apiConferenciaPagamento:{},alert:()=>{},location:{reload(){throw Error('Não deveria recarregar');}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const first=ctx.window.adicionarPagamento('p');
 await new Promise(resolve=>setImmediate(resolve));
 await ctx.window.adicionarPagamento('p');assert.equal(reviewed,1);release(false);await first;assert.equal(saved,0);assert.equal(ctx.pagamentosEmAndamento.size,0);
});
test('cancelar confirmação integral não grava nem dispara bonificações',async()=>{
 const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
 const start=html.indexOf('window.confirmarParcela = async'),end=html.indexOf('// 📥 ABA: SOLICITAÇÕES',start);
 const source=html.slice(start,end);let saved=0,reviewed=0;
 const ctx={window:{},pagamentosEmAndamento:new Set(),Date,doc:(_,c)=>c,db:{},getDocFromServer:async ref=>({exists:()=>true,data:()=>ref==='parcelas'?{...parcel,vencimento:{toDate:()=>parcel.vencimento}}:loan}),arredondarDinheiro:v=>Math.round(v*100)/100,calcularDistribuicaoPagamento:()=>({}),prompt:()=> '2026-11-26',dataLocalInformada:()=>now,inicioDoDia:d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()),previaPagamento,solicitarPagamentoReal:async()=>{reviewed++;return null;},salvarPagamentoConferido:()=>{saved++;},apiConferenciaPagamento:{},alert:message=>{throw Error(message);},console};
 vm.createContext(ctx);vm.runInContext(source,ctx);await ctx.window.confirmarParcela('p');assert.equal(reviewed,1);assert.equal(saved,0);assert.equal(ctx.pagamentosEmAndamento.size,0);
});
