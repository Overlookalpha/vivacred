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
export function previaPagamentoReal(parcel,loan,input,mode,now=new Date()){
 if(!['parcial','confirmar'].includes(mode))throw Error('Tipo de pagamento inválido.');
 if(['pago','perdido','cancelado','finalizado'].includes(parcel.status)||loan.finalizado||['quitado','finalizado','perdido','rejeitado','cancelado'].includes(loan.status))throw Error('Esta parcela ou empréstimo está encerrado.');
 const pais=loan.pais||'BR';parseDate(input.dataReal);
 if(input.dataReal>dateKey(now,pais))throw Error('A data real do pagamento não pode ser futura.');
 if(parcel.ultimaDataPagamentoRealConferida&&input.dataReal<parcel.ultimaDataPagamentoRealConferida)throw Error('Já existe um recebimento com data posterior nesta parcela. Confira o histórico antes de inserir um pagamento anterior.');
 const total=Number(parcel.valor),pago=Number(parcel.pago||0);
 if(!Number.isFinite(total)||total<=0||!Number.isFinite(pago)||pago<0||pago>total)throw Error('Confira os valores registados na parcela.');
 const recebido=valorPagamento(input.valor),jurosRecebidos=valorPagamento(input.juros||0),multaRecebida=valorPagamento(input.multa||0);
 const paraParcela=round(recebido-jurosRecebidos-multaRecebida);
 if(paraParcela<0)throw Error('Juros e multa não podem superar o total recebido.');
 const [y,m,d]=input.dataReal.split('-').map(Number),v=dateKey(parcel.vencimento,pais).split('-').map(Number);
 const charge=calcularCobrancaParcela({...parcel,vencimento:new Date(v[0],v[1]-1,v[2],12)},new Date(y,m-1,d,12));
 if(!Number.isFinite(charge.totalAtualizado))throw Error('Não foi possível calcular a cobrança.');
 const base=round(total-pago);
 if(paraParcela>base||jurosRecebidos>charge.juros||multaRecebida>charge.multa)throw Error('A composição supera o saldo devido nesta data. Confira total, juros e multa ou o acordo registado.');
 const saldoContratual=round(base-paraParcela),jurosRestantes=round(charge.juros-jurosRecebidos),multaRestante=round(charge.multa-multaRecebida),saldoAtualizado=round(saldoContratual+jurosRestantes+multaRestante);
 if(mode==='confirmar'&&saldoAtualizado!==0)throw Error('O recebimento não quita toda a cobrança. Use Adicionar Pagamento para receber parcialmente ou registe o acordo antes de confirmar.');
 if(mode==='parcial'&&recebido<=0)throw Error('Informe o valor realmente recebido.');
 if(mode==='parcial'&&saldoContratual===0)throw Error(saldoAtualizado===0?'Este valor quita a parcela. Use o botão Confirmar para concluir a quitação.':'Ainda há encargos pendentes. Confira a composição; a quitação exige receber os encargos ou registar um acordo.');
 const descontoAcordo=parcel.acordoAtivo&&parcel.restanteAntesAcordo!=null&&parcel.valorAcordado!=null?round(Math.max(0,Number(parcel.restanteAntesAcordo)-Number(parcel.valorAcordado))):0;
 return {discriminado:true,mode,pais,dataReal:input.dataReal,valorParcela:total,jaPago:pago,recebido,paraParcela,jurosRecebidos,multaRecebida,novoPago:round(pago+paraParcela),saldoContratual,jurosCalculados:charge.juros,multaCalculada:charge.multa,totalAtualizado:charge.totalAtualizado,jurosRestantes,multaRestante,saldoAtualizado,descontoAcordo,descontoNovo:0,semEncargos:parcel.acordoSemEncargos===true};
}
export function distribuirRecebimentoReal(preview,loan,parcel){
 const principal=Number(loan.valor||0),total=Number(loan.valorFinal||principal||0),padrao=total>0?Math.min(1,principal/total):1;
 const ratio=parcel.acordoAtivo===true?Number(parcel.proporcaoPrincipalAcordo??padrao):padrao;
 if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw Error('Confira a proporção de capital do acordo.');
 const principalRecuperado=round(preview.paraParcela*ratio),repasseEvelyn=round(preview.recebido*.1),lucroBruto=round(preview.recebido-principalRecuperado);
 return {valorBruto:preview.recebido,principalRecuperado,lucroBruto,repasseEvelyn,valorLiquido:round(preview.recebido-repasseEvelyn),lucroLiquido:round(lucroBruto-repasseEvelyn)};
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
  const checked=preview.discriminado?previaPagamentoReal(parcel.data(),loan.data(),{valor:preview.recebido,juros:preview.jurosRecebidos,multa:preview.multaRecebida,dataReal:preview.dataReal},preview.mode,agora):previaPagamento(parcel.data(),loan.data(),preview.recebido,preview.mode,reference,agora);
  if(signature(checked)!==signature(preview))throw Error('A prévia mudou. Reabra a conferência.');
  if(Number(patch.pago)!==preview.novoPago||Number(patch.restante)!==preview.saldoContratual)throw Error('O lançamento não corresponde à conferência.');
  const quitacao=preview.mode==='confirmar'&&api.prepararQuitacao
    ?await api.prepararQuitacao(api,tx,parcel.data(),loan.data(),preview,operationId):null;
  const atual=parcel.data();
  const composicao=preview.discriminado?{
   jurosPagos:round(Number(atual.jurosPagos||0)+preview.jurosRecebidos),multaPaga:round(Number(atual.multaPaga||0)+preview.multaRecebida),
   jurosMoraRecebidosSeparados:round(Number(atual.jurosMoraRecebidosSeparados||0)+preview.jurosRecebidos),multaRecebidaSeparada:round(Number(atual.multaRecebidaSeparada||0)+preview.multaRecebida),
   encargosHistoricosNaoDiscriminados:atual.encargosHistoricosNaoDiscriminados===true||(Number(atual.pago||0)>0&&(atual.jurosPagos==null||atual.multaPaga==null)),ultimaDataPagamentoRealConferida:preview.dataReal
  }:{};
  tx.update(ref,{...patch,...composicao});
  if(quitacao)quitacao.aplicar();
  api.aplicarFinanceiro(tx,preview.recebido,loan.data(),parcel.data(),preview);
  tx.set(audit,{parcelaId:expected.parcelaId,emprestimoId:expected.parcel.emprestimoId,userId:expected.loan.userId||null,numeroParcela:expected.parcel.numero||null,valorRecebido:preview.recebido,dataPagamentoReal:preview.dataReal,pagoAntes:preview.jaPago,pagoDepois:preview.novoPago,saldoDepois:preview.saldoContratual,jurosCalculados:preview.jurosCalculados,multaCalculada:preview.multaCalculada,descontoNovo:0,descontoAcordoExistente:preview.descontoAcordo,encargosDiscriminadosNoRecebimento:preview.discriminado===true,...(quitacao?{isaCoinsCreditadas:quitacao.moedas.total,bonusAntecipacaoISC:quitacao.moedas.antecipacao,bonusQuitacaoISC:quitacao.moedas.quitacao,bonusIndicacaoISC:quitacao.moedas.indicacao}:{}),...(preview.discriminado?{valorParcelaRecebido:preview.paraParcela,jurosRecebidos:preview.jurosRecebidos,multaRecebida:preview.multaRecebida,saldoAtualizadoDepois:preview.saldoAtualizado}:{}),tipo:preview.mode,pais:preview.pais,por:uid,em:api.serverTimestamp()});
  return operationId;
 });
}
