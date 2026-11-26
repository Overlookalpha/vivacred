// Mesma regra do administrador, extraída sem alterar taxas ou valores.
export function calcularCobrancaParcela(parcela, hojeReferencia = new Date()){

 if(!parcela){
  return {
   valorOriginal: 0,
   valorPago: 0,
   diasAtraso: 0,
   multa: 0,
   juros: 0,
   totalAtualizado: 0
  };
 }

 const valorOriginal = Number(parcela.valor || 0);
 const valorPago = Number(parcela.pago || 0);

 if(["pago","perdido"].includes(parcela.status)){
  return {
   valorOriginal,
   valorPago,
   diasAtraso: 0,
   multa: 0,
   juros: 0,
   totalAtualizado: 0
  };
 }

 if(!parcela.vencimento){
  return {
   valorOriginal,
   valorPago,
   diasAtraso: 0,
   multa: 0,
   juros: 0,
   totalAtualizado: Math.max(0, valorOriginal - valorPago)
  };
 }

 const vencimento = parcela.vencimento.toDate
  ? parcela.vencimento.toDate()
  : new Date(parcela.vencimento);

 const inicioHoje = new Date(
  hojeReferencia.getFullYear(),
  hojeReferencia.getMonth(),
  hojeReferencia.getDate()
 );

 const inicioVencimento = new Date(
  vencimento.getFullYear(),
  vencimento.getMonth(),
  vencimento.getDate()
 );

 const diasAtraso = Math.max(
  0,
  Math.floor(
   (inicioHoje - inicioVencimento) /
   (1000 * 60 * 60 * 24)
  )
 );

 // Um acordo sem encargos vale apenas para esta parcela. A data de
 // vencimento continua intacta e as demais parcelas seguem cobrando normal.
 const acordoSemEncargos = parcela.acordoSemEncargos === true;

 const multaTotalCalculada = diasAtraso > 0 && !acordoSemEncargos
  ? Number((valorOriginal * 0.05).toFixed(2))
  : 0;

 const jurosTotalCalculado = diasAtraso > 0 && !acordoSemEncargos
  ? Number((valorOriginal * 0.01 * diasAtraso).toFixed(2))
  : 0;

 // Novos encargos recebidos ficam separados de pago (saldo contratual).
 // Campos antigos não são reinterpretados nem subtraídos duas vezes.
 const multa = Number(Math.max(0,multaTotalCalculada - Number(parcela.multaRecebidaSeparada || 0)).toFixed(2));
 const juros = Number(Math.max(0,jurosTotalCalculado - Number(parcela.jurosMoraRecebidosSeparados || 0)).toFixed(2));
 const restanteBase = Math.max(0, valorOriginal - valorPago);

 const totalAtualizado = Number(
  (restanteBase + multa + juros).toFixed(2)
 );

 return {
  valorOriginal,
  valorPago,
  diasAtraso,
  multa,
  juros,
  totalAtualizado
 };
}
export function totalRecebidoParcela(parcela){
 return Number((Number(parcela.pago||0)+Number(parcela.jurosMoraRecebidosSeparados||0)+Number(parcela.multaRecebidaSeparada||0)).toFixed(2));
}
