import test from 'node:test';
import assert from 'node:assert/strict';
import {emprestimoQuitado,prepararConfirmacaoPagamento,ultimaParcelaRecebida,criarConfirmacaoPagamento} from '../confirmacao-pagamento.mjs';
import {corresponde} from '../painel-emprestimos.mjs';
const loan={pais:'BR',parcelas:2,status:'finalizado',finalizado:true,userId:'u',nomeCliente:'Cliente Teste',telefoneCliente:'+5551998208350'};
const paid=(id,n)=>({id,numero:n,valor:350,pago:350,status:'pago',emprestimoId:'e',userId:'u'});
test('quitados exigem parcelas pagas; perda e documentos ausentes não significam quitação',()=>{
 const p=[paid('1',1),paid('2',2)];assert.equal(emprestimoQuitado(loan,p),true);
 assert.equal(emprestimoQuitado(loan,[p[0]]),false);assert.equal(emprestimoQuitado(loan,[]),false);
 for(const status of ['perdido','cancelado'])assert.equal(emprestimoQuitado(loan,[p[0],{...p[1],status}]),false);
 assert.equal(emprestimoQuitado(loan,[p[0],{...p[1],pago:100,status:'pendente'}]),false);
 assert.equal(emprestimoQuitado({...loan,arquivado:true},p),true);
});
test('mensagem usa total realmente recebido com encargos, sem recalcular ou somar duas vezes',()=>{
 const p={...paid('2',2),jurosMoraRecebidosSeparados:7,multaRecebidaSeparada:17.5},r=prepararConfirmacaoPagamento(p,loan,[paid('1',1),p]);
 assert.equal(r.valorRecebido,374.5);assert.match(r.mensagem.replaceAll('\u00a0',' '),/R\$ 374,50/);assert.match(r.mensagem,/totalmente quitado/);assert.equal(new URL(r.url).searchParams.get('text'),r.mensagem);
 const parcialLoan={...loan,status:'ativo',finalizado:false};const other={...paid('1',1),status:'pendente',pago:0};assert.doesNotMatch(prepararConfirmacaoPagamento(p,parcialLoan,[other,p]).mensagem,/totalmente quitado/);
 assert.throws(()=>prepararConfirmacaoPagamento(other,parcialLoan,[other,p]));
});
test('o contrato quitado continua filtrável e o contacto seleciona a última parcela recebida',()=>{
 const item={emp:loan,quitado:true,pendentes:[],pagas:2};assert.ok(corresponde(item,{situacao:'quitados'}));assert.ok(!corresponde(item,{situacao:'abertos'}));
 assert.equal(ultimaParcelaRecebida([{...paid('1',1),dataPagamentoReal:'2026-11-26'},{...paid('2',2),dataPagamentoReal:'2026-11-20'}]).id,'1');
});
test('abre confirmação de quitado, regista contacto e não envia automaticamente',async()=>{
 const p=[paid('1',1),{...paid('2',2),jurosMoraRecebidosSeparados:7,multaRecebidaSeparada:17.5}];let url='',record=null,aberturas=0;
 globalThis.document={addEventListener(){}};globalThis.alert=()=>{};globalThis.window={open:()=>{aberturas++;throw Error('Não deve abrir uma aba vazia');}};
 const api={mostrarMensagemWhatsApp:prepared=>{url=prepared.url;},db:{},doc:(_,c,id)=>c+'/'+id,collection:(_,c)=>c,where(){},query(){},getDocsFromServer:async()=>({docs:p.map(x=>({id:x.id,data:()=>x}))}),getDocFromServer:async ref=>({exists:()=>true,data:()=>ref==='emprestimos/e'?loan:ref.startsWith('usuarios/')?{telefone:'+5551998208350'}:p[1]}),registrar:async(expected,prepared)=>{record={expected,prepared};}};
 assert.equal(await criarConfirmacaoPagamento(api).abrir(null,'e'),true);assert.equal(aberturas,0);assert.match(url,/wa.me\/5551998208350/);assert.equal(record.prepared.tipoContato,'confirmacao_pagamento');assert.equal(record.prepared.valorRecebido,374.5);
});
test('falha de consulta não deixa aba vazia nem mostra confirmação incorreta',async()=>{
 let abas=0,previas=0,aviso='';
 globalThis.document={addEventListener(){}};globalThis.window={open(){abas++;}};globalThis.alert=texto=>{aviso=texto;};
 const api={db:{},doc:(_,c,id)=>c+'/'+id,getDocFromServer:async()=>{throw Error('Falha ao consultar pagamento');},mostrarMensagemWhatsApp(){previas++;}};
 assert.equal(await criarConfirmacaoPagamento(api).abrir('p'),false);
 assert.equal(abas,0);assert.equal(previas,0);assert.match(aviso,/Falha ao consultar/);
});
