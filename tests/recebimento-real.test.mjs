import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {previaPagamentoReal,distribuirRecebimentoReal,salvarPagamentoConferido} from '../conferencia-pagamento.mjs';
import {calcularCobrancaParcela,totalRecebidoParcela} from '../cobranca-parcela.mjs';
import {resumoHistorico} from '../historico-cliente.mjs';
import {linhaExtrato} from '../extrato-detalhes.mjs';
const {calcularCobrancaParcela:server}=createRequire(import.meta.url)('../functions/lib/calculoParcela.js');
const now=new Date('2026-11-26T12:00:00Z'),parcel={valor:350,pago:0,restante:350,status:'pendente',userId:'u',emprestimoId:'e',numero:1,vencimento:new Date('2026-11-24T12:00:00Z')},loan={id:'e',pais:'BR',status:'ativo',userId:'u',valor:1000,valorFinal:1300};
const input={valor:'374,50',juros:'7,00',multa:'17,50',dataReal:'2026-11-26'};
test('quitação de 374,50 discrimina 350 de parcela, 7 de juros e 17,50 de multa',()=>{
 const r=previaPagamentoReal(parcel,loan,input,'confirmar',now);
 assert.equal(r.recebido,374.5);assert.equal(r.paraParcela,350);assert.equal(r.jurosRecebidos,7);assert.equal(r.multaRecebida,17.5);assert.equal(r.saldoAtualizado,0);assert.equal(r.novoPago,350);
 const d=distribuirRecebimentoReal(r,loan,parcel);assert.equal(d.valorLiquido,337.05);assert.equal(d.repasseEvelyn,37.45);assert.equal(d.principalRecuperado,269.23);assert.equal(d.lucroBruto,105.27);
});
test('parcial conserva saldo e encargos recebidos não voltam a ser cobrados',()=>{
 const r=previaPagamentoReal(parcel,loan,{...input,valor:'100'},'parcial',now);
 assert.equal(r.paraParcela,75.5);assert.equal(r.saldoContratual,274.5);assert.equal(r.saldoAtualizado,274.5);
 const p={...parcel,pago:r.novoPago,jurosMoraRecebidosSeparados:7,multaRecebidaSeparada:17.5};
 assert.equal(calcularCobrancaParcela(p,now).totalAtualizado,274.5);
 const tomorrow=new Date('2026-11-27T12:00:00Z'),charge=calcularCobrancaParcela(p,tomorrow);
 assert.equal(charge.juros,3.5);assert.equal(charge.multa,0);assert.equal(charge.totalAtualizado,278);
 assert.equal(server(p,tomorrow).restante,278);
 const html=readFileSync(new URL('../home.html',import.meta.url),'utf8');const source=html.slice(html.indexOf('function obterSituacaoParcela('),html.indexOf('function atualizarResumoProximaParcela',html.indexOf('function obterSituacaoParcela(')));
 const context={Date};vm.createContext(context);vm.runInContext(source,context);
 assert.equal(context.obterSituacaoParcela({...p,vencimento:{toDate:()=>p.vencimento}},tomorrow).restante,278);
});
test('pagamento somente de encargos é registado sem abater a parcela',()=>{
 const r=previaPagamentoReal(parcel,loan,{...input,valor:'24,50'},'parcial',now);assert.equal(r.paraParcela,0);assert.equal(r.saldoContratual,350);
});
test('não cria descontos, crédito excedente ou baixa parcial indevida',()=>{
 for(const x of [{...input,valor:350},{...input,valor:400},{...input,juros:8},{...input,multa:-1},{...input,dataReal:'2026-11-27'}])assert.throws(()=>previaPagamentoReal(parcel,loan,x,'confirmar',now));
 assert.throws(()=>previaPagamentoReal(parcel,loan,{...input,valor:350,juros:0,multa:0},'parcial',now));
 assert.throws(()=>previaPagamentoReal(parcel,loan,input,'parcial',now));
 assert.throws(()=>previaPagamentoReal({...parcel,ultimaDataPagamentoRealConferida:'2026-11-27'},loan,input,'confirmar',now));
});
test('acordo sem encargos exige apenas o saldo contratual e não cobra encargos dispensados',()=>{
 const p={...parcel,pago:100,acordoSemEncargos:true};const r=previaPagamentoReal(p,loan,{valor:250,juros:0,multa:0,dataReal:input.dataReal},'confirmar',now);assert.equal(r.novoPago,350);assert.equal(r.saldoAtualizado,0);
 assert.throws(()=>previaPagamentoReal(p,loan,{valor:251,juros:1,multa:0,dataReal:input.dataReal},'confirmar',now));
});
test('valores antigos não são reinterpretados nem duplicados no histórico e extrato',()=>{
 assert.equal(totalRecebidoParcela({pago:374.5,jurosPagos:7,multaPaga:17.5}),374.5);
 const p={...parcel,pago:350,status:'pago',jurosPagos:7,multaPaga:17.5,jurosMoraRecebidosSeparados:7,multaRecebidaSeparada:17.5};
 assert.equal(totalRecebidoParcela(p),374.5);const r=resumoHistorico({pais:'BR',score:45},[loan],[p],now);assert.equal(r.totais.BR.recebido,374.5);assert.equal(r.totais.BR.juros,7);assert.equal(r.totais.BR.multa,17.5);
 assert.match(linhaExtrato(p,v=>Number(v).toFixed(2)),/<td>374.50<\/td>/);
});
test('salva componentes, recebimento e Caixa uma única vez atomicamente',async()=>{
 const records=new Map([['admins/a',{}],['parcelas/p',parcel],['emprestimos/e',loan]]),writes=[];
 const api={db:{},auth:{currentUser:{uid:'a'}},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>1,aplicarFinanceiro:(tx,value)=>tx.set('caixa/test',{recebido:value}),runTransaction:async(_,fn)=>{const staged=[];let writing=false;await fn({get:async k=>{assert.equal(writing,false);return {exists:()=>records.has(k),data:()=>records.get(k)};},set:(k,v)=>{writing=true;staged.push([k,v]);},update:(k,v)=>{writing=true;staged.push([k,{...records.get(k),...v}]);}});for(const [k,v] of staged){records.set(k,v);writes.push(k);}}};
 const r=previaPagamentoReal(parcel,loan,input,'confirmar',now),expected={parcelaId:'p',parcel,loan};
 await salvarPagamentoConferido(api,expected,r,{pago:350,restante:0,status:'pago'},'op',now);
 const p=records.get('parcelas/p');assert.equal(p.jurosPagos,7);assert.equal(p.multaPaga,17.5);assert.equal(totalRecebidoParcela(p),374.5);assert.equal(records.get('caixa/test').recebido,374.5);
 const audit=records.get('historicoPagamentos/op');assert.equal(audit.encargosDiscriminadosNoRecebimento,true);assert.equal(audit.valorRecebido,374.5);assert.equal(audit.valorParcelaRecebido,350);assert.equal(audit.jurosRecebidos,7);assert.equal(audit.multaRecebida,17.5);
 await assert.rejects(salvarPagamentoConferido(api,expected,r,{pago:350,restante:0,status:'pago'},'op',now));assert.equal(writes.length,3);
});
