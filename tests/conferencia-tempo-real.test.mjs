import test from 'node:test';
import assert from 'node:assert/strict';
import {atualizarConferenciaTempoReal} from '../conferencia-tempo-real.mjs';
function tela(){
 const linha={dataset:{conferenciaParcela:'p1'},hidden:false},outra={dataset:{conferenciaParcela:'p2'},hidden:false};
 const nodes={'[data-status-conferencia]':{hidden:false},'#btnConfirmarPagamentoParcela':{disabled:true},'#comprovantePagamento':{disabled:false},'[data-previa-moedas]':{hidden:false},'#btnFecharPagamentoParcela':{before:e=>nodes['[data-pagamento-confirmado]']=e}};
 const modal={dataset:{parcelaId:'p1'},querySelector:k=>nodes[k]};
 const root={querySelectorAll:()=>[linha,outra],getElementById:()=>modal,createElement:()=>({dataset:{},style:{},setAttribute(){}})};
 return {linha,outra,nodes,modal,root};
}
const snapshot=p=>({docs:[{id:'p1',data:()=>p}]});
test('confirmação recebida em tempo real remove aviso na lista e modal sem recarregar',()=>{
 const h=tela();atualizarConferenciaTempoReal(snapshot({valor:270,pago:270,status:'pago'}),h.root);
 assert.equal(h.linha.hidden,true);assert.equal(h.outra.hidden,false);assert.equal(h.nodes['[data-status-conferencia]'].hidden,true);
 assert.equal(h.nodes['#btnConfirmarPagamentoParcela'].disabled,true);assert.match(h.nodes['[data-pagamento-confirmado]'].textContent,/confirmado pelo administrador/);
 assert.equal(h.nodes['[data-previa-moedas]'].hidden,true);assert.equal(h.modal.dataset.pagamentoConfirmado,'true');
 const same=h.nodes['[data-pagamento-confirmado]'];atualizarConferenciaTempoReal(snapshot({valor:270,pago:270}),h.root);assert.equal(h.nodes['[data-pagamento-confirmado]'],same);
});
test('pendência fica visível e conferência parcial posterior a remove sem declarar quitação',()=>{
 const h=tela(),p={valor:270,pago:0,pagamentoInformadoEm:new Date('2026-11-26T10:00Z')};
 atualizarConferenciaTempoReal(snapshot(p),h.root);assert.equal(h.linha.hidden,false);
 atualizarConferenciaTempoReal(snapshot({...p,pago:100,ultimaDataPagamento:new Date('2026-11-26T11:00Z')}),h.root);
 assert.equal(h.linha.hidden,true);assert.equal(h.nodes['[data-status-conferencia]'].hidden,true);assert.equal(h.nodes['#btnConfirmarPagamentoParcela'].disabled,false);assert.equal(h.nodes['[data-pagamento-confirmado]'],undefined);
});
