import {totalRecebidoParcela} from './cobranca-parcela.mjs';
import {validarTelefone} from './painel-emprestimos.mjs';
export function parcelaQuitada(p){
 return !['perdido','cancelado'].includes(p.status)&&!p.teste&&p.tipoRegistro!=='teste'&&(p.status==='pago'||Number(p.valor)>0&&Number(p.pago)>=Number(p.valor));
}
export function emprestimoQuitado(loan,parcelas){
 const numero=Number(loan.parcelas);
 return !loan.perdido&&!['perdido','cancelado','rejeitado'].includes(loan.status)&&!loan.teste&&loan.tipoRegistro!=='teste'&&parcelas.length>0&&Number.isInteger(numero)&&numero>0&&parcelas.length===numero&&parcelas.every(parcelaQuitada);
}
function momento(value){
 const date=value?.toDate?.()||(value?new Date(value):null);return date&&!Number.isNaN(+date)?+date:0;
}
export function ultimaParcelaRecebida(parcelas){
 return [...parcelas].filter(parcelaQuitada).sort((a,b)=>momento(b.dataPagamentoReal||b.dataPagamentoEfetivo)-momento(a.dataPagamentoReal||a.dataPagamentoEfetivo)||momento(b.pagoEm||b.ultimaDataPagamento)-momento(a.pagoEm||a.ultimaDataPagamento)||Number(b.numero)-Number(a.numero)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
export function prepararConfirmacaoPagamento(parcel,loan,parcelas){
 if(!parcelaQuitada(parcel))throw Error('A parcela ainda não está quitada. Nenhuma confirmação será aberta.');
 if(['perdido','cancelado','rejeitado'].includes(loan.status)||loan.perdido||loan.teste||loan.tipoRegistro==='teste')throw Error('Este empréstimo não permite confirmação de pagamento.');
 const telefone=validarTelefone(loan.telefoneCliente,loan.pais||'BR').replace(/\D/g,'');
 const valor=totalRecebidoParcela(parcel);if(!Number.isFinite(valor)||valor<=0)throw Error('Não há valor recebido registado nesta parcela. Confira o histórico.');
 const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:loan.pais==='PT'?'EUR':'BRL'}).format(v);
 const quitado=emprestimoQuitado(loan,parcelas);
 const linhas=[`Olá, ${loan.nomeCliente||'Cliente'}! ✅ Aqui é a Evellyn, assistente da IsaCred.`,'',`Confirmamos o pagamento da sua parcela nº ${parcel.numero||'—'}${loan.parcelas?' de '+loan.parcelas:''}.`,`💰 Total recebido nesta parcela: ${money(valor)}.`];
 if(!parcel.encargosHistoricosNaoDiscriminados&&Number(parcel.jurosMoraRecebidosSeparados||0)+Number(parcel.multaRecebidaSeparada||0)>0){
  linhas.push(`Neste total: ${money(Number(parcel.pago||0))} da parcela, ${money(Number(parcel.jurosMoraRecebidosSeparados||0))} de juros por atraso e ${money(Number(parcel.multaRecebidaSeparada||0))} de multa.`);
 }
 linhas.push('',quitado?'🎉 O seu empréstimo está totalmente quitado!':'Este aviso confirma o pagamento desta parcela. As demais seguem os vencimentos combinados.','Obrigado pela confiança! 😊');
 const mensagem=linhas.join('\n');return {mensagem,url:'https://wa.me/'+telefone+'?text='+encodeURIComponent(mensagem),tipoContato:'confirmacao_pagamento',valorRecebido:valor,emprestimoQuitado:quitado};
}
export function criarConfirmacaoPagamento(api){
 const abrindo=new Set();
 async function abrir(parcelaId,emprestimoId){
  const key=parcelaId||emprestimoId;if(abrindo.has(key))return false;abrindo.add(key);
  const janela=window.open('about:blank','_blank');if(!janela){abrindo.delete(key);alert('Permita a abertura do WhatsApp no navegador.');return false;}janela.opener=null;
  try{
   let parcel;
   if(parcelaId){const snap=await api.getDocFromServer(api.doc(api.db,'parcelas',parcelaId));if(!snap.exists())throw Error('Parcela não encontrada.');parcel={...snap.data(),id:parcelaId};emprestimoId=parcel.emprestimoId;}
   const snap=await api.getDocFromServer(api.doc(api.db,'emprestimos',emprestimoId));if(!snap.exists())throw Error('Empréstimo não encontrado.');const loan=snap.data();
   const ps=await api.getDocsFromServer(api.query(api.collection(api.db,'parcelas'),api.where('emprestimoId','==',emprestimoId)));
   const parcelas=ps.docs.map(p=>({...p.data(),id:p.id}));
   if(parcelas.some(p=>p.userId&&loan.userId&&p.userId!==loan.userId))throw Error('Vínculo das parcelas inconsistente. Confira o cadastro.');
   if(!parcel){if(!emprestimoQuitado(loan,parcelas))throw Error('Este empréstimo ainda não tem todas as parcelas quitadas.');parcel=ultimaParcelaRecebida(parcelas);parcelaId=parcel?.id;}
   if(!parcel)throw Error('Não foi encontrado um pagamento para confirmar.');
   // Prefer the current client contact over a phone copied into an old loan.
   if(loan.userId){const user=await api.getDocFromServer(api.doc(api.db,'usuarios',loan.userId));if(user.exists()&&user.data().telefone)loan.telefoneCliente=user.data().telefone;}
   const prepared=prepararConfirmacaoPagamento(parcel,loan,parcelas);
   await api.registrar({parcelId:parcelaId,parcel,loan},prepared);
   janela.location.replace(prepared.url);return true;
  }catch(e){janela.close();alert(e.message||'Não foi possível preparar a confirmação.');return false;}
  finally{abrindo.delete(key);}
 }
 document.addEventListener('click',event=>{const target=event.target.closest?.('[data-confirmacao-parcela],[data-confirmacao-emprestimo]');if(!target)return;event.preventDefault();void abrir(target.dataset.confirmacaoParcela,target.dataset.confirmacaoEmprestimo);});
 return {abrir};
}
