import {dateKey,parseDate,signature} from './vencimentos.mjs';
import {calcularCobrancaParcela} from './cobranca-parcela.mjs';
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
export function valorPagamento(value){
 const text=String(value).trim();
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(text))throw Error('Informe um valor válido, com até duas casas decimais.');
 const result=Number(text.replace(',','.'));
 if(!Number.isFinite(result)||result<0)throw Error('Valor recebido inválido.');
 return result;
}
export function previaPagamento(parcel,loan,valor,mode,dataReal,now=new Date()){
 if(!['parcial','confirmar'].includes(mode))throw Error('Tipo de pagamento inválido.');
 if(['pago','perdido','cancelado','finalizado'].includes(parcel.status)||loan.finalizado||['quitado','finalizado','perdido','rejeitado','cancelado'].includes(loan.status))throw Error('Esta parcela ou empréstimo está encerrado.');
 const total=Number(parcel.valor),pago=Number(parcel.pago||0);
 if(!Number.isFinite(total)||total<=0||!Number.isFinite(pago)||pago<0||pago>total)throw Error('Confira os valores registados na parcela.');
 const pais=loan.pais||'BR',key=dateKey(dataReal,pais),hoje=dateKey(now,pais);parseDate(key);
 if(key>hoje)throw Error('A data real do pagamento não pode ser futura.');
 const restante=round(total-pago),recebido=valorPagamento(valor);
 if(recebido>restante||mode==='parcial'&&recebido<=0)throw Error('O valor recebido deve ser positivo e não ultrapassar o saldo contratual.');
 if(mode==='confirmar'&&recebido!==restante)throw Error('O saldo mudou. Reabra a confirmação.');
 const venc=dateKey(parcel.vencimento,pais).split('-').map(Number),dia=key.split('-').map(Number);
 const cobranca=calcularCobrancaParcela({...parcel,vencimento:new Date(venc[0],venc[1]-1,venc[2],12)},new Date(dia[0],dia[1]-1,dia[2],12));
 if(!Number.isFinite(cobranca.totalAtualizado))throw Error('Não foi possível conferir os encargos.');
 const descontoAcordo=parcel.acordoAtivo&&Number.isFinite(Number(parcel.restanteAntesAcordo))&&Number.isFinite(Number(parcel.valorAcordado))?round(Math.max(0,Number(parcel.restanteAntesAcordo)-Number(parcel.valorAcordado))):0;
 return {mode,pais,dataReal:key,valorParcela:total,jaPago:pago,recebido,novoPago:round(pago+recebido),saldoContratual:round(restante-recebido),jurosCalculados:cobranca.juros,multaCalculada:cobranca.multa,totalAtualizado:cobranca.totalAtualizado,encargosFora:round(cobranca.juros+cobranca.multa),descontoAcordo,descontoNovo:0,semEncargos:parcel.acordoSemEncargos===true};
}
export async function salvarPagamentoConferido(api,expected,preview,patch,operationId,agora=new Date()){
 const uid=api.auth.currentUser?.uid;if(!uid)throw Error('Entre novamente como administrador.');
 const ref=api.doc(api.db,'parcelas',expected.parcelaId),loanRef=api.doc(api.db,'emprestimos',expected.parcel.emprestimoId),audit=api.doc(api.db,'historicoPagamentos',operationId);
 return api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',uid)),parcel=await tx.get(ref),loan=await tx.get(loanRef),prior=await tx.get(audit);
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(prior.exists())throw Error('Este pagamento já foi registado. Atualize a página.');
  if(!parcel.exists()||!loan.exists()||signature(parcel.data())!==signature(expected.parcel)||signature(loan.data())!==signature(expected.loan))throw Error('A parcela ou o empréstimo mudou durante a conferência. Nenhum valor foi salvo. Reabra e confira.');
  const d=preview.dataReal.split('-').map(Number),reference=new Date(d[0],d[1]-1,d[2],12);
  const checked=previaPagamento(parcel.data(),loan.data(),preview.recebido,preview.mode,reference,agora);
  if(signature(checked)!==signature(preview))throw Error('A prévia mudou. Reabra a conferência.');
  if(Number(patch.pago)!==preview.novoPago||Number(patch.restante)!==preview.saldoContratual)throw Error('O lançamento não corresponde à conferência.');
  tx.update(ref,patch);
  api.aplicarFinanceiro(tx,preview.recebido,loan.data(),parcel.data());
  tx.set(audit,{parcelaId:expected.parcelaId,emprestimoId:expected.parcel.emprestimoId,userId:expected.loan.userId||null,numeroParcela:expected.parcel.numero||null,valorRecebido:preview.recebido,dataPagamentoReal:preview.dataReal,pagoAntes:preview.jaPago,pagoDepois:preview.novoPago,saldoDepois:preview.saldoContratual,jurosCalculados:preview.jurosCalculados,multaCalculada:preview.multaCalculada,descontoNovo:0,descontoAcordoExistente:preview.descontoAcordo,encargosDiscriminadosNoRecebimento:false,tipo:preview.mode,pais:preview.pais,por:uid,em:api.serverTimestamp()});
  return operationId;
 });
}
