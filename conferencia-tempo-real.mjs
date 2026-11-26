import {aguardandoConferencia} from './previa-moedas.mjs';
// Só apresentação: nenhuma baixa financeira ou alteração de moedas.
export function atualizarConferenciaTempoReal(snapshot,root=document){
 for(const doc of snapshot.docs){
  const p=doc.data(),pago=p.status==='pago'||Number(p.valor)>0&&Number(p.pago||0)>=Number(p.valor);
  const aguardando=aguardandoConferencia(p);
  root.querySelectorAll('[data-conferencia-parcela]').forEach(e=>{if(e.dataset.conferenciaParcela===doc.id)e.hidden=!aguardando;});
  const modal=root.getElementById('modalPagamentoParcela');
  if(!modal||modal.dataset.parcelaId!==doc.id)continue;
  const aviso=modal.querySelector('[data-status-conferencia]');
  const estavaAguardando=aviso&&!aviso.hidden;
  if(aviso){aviso.hidden=!aguardando;}
  if(pago){
   modal.dataset.pagamentoConfirmado='true';
   let confirmado=modal.querySelector('[data-pagamento-confirmado]');
   if(!confirmado){confirmado=root.createElement('p');confirmado.dataset.pagamentoConfirmado='true';confirmado.setAttribute('role','status');confirmado.style.cssText='padding:12px;background:#ecfdf5;color:#166534;border-radius:10px';modal.querySelector('#btnFecharPagamentoParcela').before(confirmado);}
   confirmado.textContent='✅ Pagamento confirmado pelo administrador. Esta parcela está paga. O saldo de ISAcoins é atualizado após o crédito das moedas.';
   const botao=modal.querySelector('#btnConfirmarPagamentoParcela');botao.disabled=true;botao.textContent='✅ Pagamento confirmado';
   const arquivo=modal.querySelector('#comprovantePagamento');if(arquivo)arquivo.disabled=true;
   const previa=modal.querySelector('[data-previa-moedas]');if(previa)previa.hidden=true;
  }else if(!aguardando&&estavaAguardando){
   const botao=modal.querySelector('#btnConfirmarPagamentoParcela');botao.disabled=false;botao.textContent='✅ Já efetuei o pagamento';
  }
 }
}
