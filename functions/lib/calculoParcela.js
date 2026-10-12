"use strict";

/**
 * Calcula os encargos exclusivamente a partir dos dados já salvos. Nenhum
 * valor financeiro recebido do navegador é usado nesta função.
 */
function calcularCobrancaParcela(parcela, agora = new Date()) {
  const valor = Number(parcela.valor || 0);
  const pago = Number(parcela.pago || 0);

  if (!Number.isFinite(valor) || valor < 0 || !Number.isFinite(pago) || pago < 0) {
    throw new Error("Dados financeiros inválidos na parcela.");
  }

  const vencimento = parcela.vencimento && typeof parcela.vencimento.toDate === "function"
    ? parcela.vencimento.toDate()
    : new Date(parcela.vencimento);

  if (pago >= valor || Number.isNaN(vencimento.getTime()) || agora <= vencimento) {
    return { multa: 0, juros: 0, diasAtraso: 0, restante: Math.max(0, valor - pago) };
  }

  const diasAtraso = Math.floor((agora - vencimento) / (1000 * 60 * 60 * 24));
  const acordoSemEncargos = parcela.acordoSemEncargos === true;
  const multa = acordoSemEncargos ? 0 : valor * 0.05;
  const juros = acordoSemEncargos ? 0 : valor * 0.01 * diasAtraso;

  return {
    multa,
    juros,
    diasAtraso,
    restante: Math.max(0, valor + multa + juros - pago)
  };
}

module.exports = { calcularCobrancaParcela };
