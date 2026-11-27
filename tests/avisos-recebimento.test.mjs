import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararAvisoRecebimento,marcarRecebimentoAvisado} from '../avisos-recebimento.mjs';
import {resumirPendencias} from '../central-pendencias.mjs';
const loan={id:'l',userId:'u',nomeCliente:'Cliente',telefoneCliente:'+5551999990000',pais:'BR',status:'finalizado',finalizado:true,parcelas:1};
const pagamento={id:'r',parcelaId:'p',emprestimoId:'l',userId:'u',numeroParcela:1,avisoClienteStatus:'pendente',valorRecebido:321,valorParcelaRecebido:300,jurosRecebidos:6,multaRecebida:15,encargosDiscriminadosNoRecebimento:true,saldoDepois:0,pais:'BR',dataPagamentoReal:'2026-11-27'};
test('última parcela quitada permanece na central e WhatsApp usa o recebimento real com juros e multa',()=>{
 const p={id:'p',valor:300,pago:300,status:'pago',emprestimoId:'l'};
 const r=resumirPendencias({usuarios:[{id:'u',nome:'Cliente'}],emprestimos:[loan],parcelas:[p],recebimentos:[pagamento]});
 assert.equal(r.avisos.length,1);assert.equal(r.avisos[0].valorRecebido,321);
 const msg=prepararAvisoRecebimento(pagamento,loan,[p]);assert.equal(msg.valorRecebido,321);assert.match(msg.mensagem,/321,00/);assert.match(msg.mensagem,/6,00 de juros/);assert.match(msg.mensagem,/15,00 de multa/);assert.match(msg.mensagem,/totalmente quitado/);assert.equal(decodeURIComponent(msg.url.split('?text=')[1]),msg.mensagem);
});
test('pagamento parcial mostra somente o valor recebido nessa operação e o saldo daquele pagamento',()=>{
 const r=prepararAvisoRecebimento({...pagamento,valorRecebido:100,encargosDiscriminadosNoRecebimento:false,saldoDepois:200},{...loan,status:'ativo',finalizado:false},[{valor:300,pago:100}]);
 assert.match(r.mensagem,/100,00/);assert.match(r.mensagem,/200,00/);assert.doesNotMatch(r.mensagem,/totalmente quitado|concluiu a quitação/);
});
test('não importa pagamentos antigos sem pendência explícita nem registros já avisados',()=>{
 const r=resumirPendencias({recebimentos:[pagamento,{...pagamento,id:'a',avisoClienteStatus:undefined},{...pagamento,id:'b',avisoClienteStatus:'avisado'}]});assert.deepEqual(r.avisos.map(r=>r.id),['r']);
 assert.throws(()=>prepararAvisoRecebimento({...pagamento,userId:'outro'},loan));assert.throws(()=>prepararAvisoRecebimento({...pagamento,avisoClienteStatus:'avisado'},loan));
});
function fixture({admin=true,contato=true,avisado=false}={}){
 const rows=new Map([['admins/a',admin?{}:null],['historicoPagamentos/r',{...pagamento,avisoClienteStatus:avisado?'avisado':'pendente'}],['historicoCobrancas/pagamento-r',contato?{tipoContato:'confirmacao_pagamento',parcelaId:'p',valorRecebido:321,status:'preparada'}:null]]),writes=[];
 const api={db:{},auth:{currentUser:{uid:'a'}},doc:(_,col,id)=>col+'/'+id,serverTimestamp:()=>({server:true}),runTransaction:async(_,fn)=>{
  let writing=false;const staged=[];await fn({get:async ref=>{assert.equal(writing,false);return {exists:()=>!!rows.get(ref),data:()=>rows.get(ref)};},update:(ref,data)=>{writing=true;staged.push([ref,data]);}});
  for(const [ref,data] of staged){rows.set(ref,{...rows.get(ref),...data});writes.push([ref,data]);}
 }};return {api,rows,writes};
}
test('marcar avisado atualiza pendência e histórico juntos sem alterar parcela, Caixa ou moedas',async()=>{
 const f=fixture();await marcarRecebimentoAvisado(f.api,'r');assert.equal(f.rows.get('historicoPagamentos/r').avisoClienteStatus,'avisado');assert.equal(f.rows.get('historicoCobrancas/pagamento-r').status,'enviada');assert.equal(f.writes.length,2);assert.equal(f.rows.get('historicoPagamentos/r').valorRecebido,321);
 await marcarRecebimentoAvisado(f.api,'r');assert.equal(f.writes.length,2);
});
test('sem admin ou sem mensagem preparada não marca nem grava parcialmente',async()=>{
 for(const config of [{admin:false},{contato:false}]){const f=fixture(config);await assert.rejects(marcarRecebimentoAvisado(f.api,'r'));assert.equal(f.writes.length,0);}
});
