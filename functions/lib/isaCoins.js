"use strict";
const LOTE = 10000;
function inteiro(valor, nome) {
  if (!Number.isSafeInteger(valor) || valor < 0) throw new Error(nome + " inválido; conferir o extrato.");
  return valor;
}
function reservar(usuario) {
  const saldo = inteiro(usuario.isaCoins ?? 0, "Saldo");
  const reservado = inteiro(usuario.isaCoinsReservadas ?? 0, "Reserva");
  if (saldo < LOTE) throw new Error("Saldo insuficiente.");
  const pais = usuario.pais === "PT" ? "PT" : "BR";
  return { moedas: LOTE, valor: pais === "PT" ? 20 : 100, pais,
    saldo: saldo - LOTE, reservado: inteiro(reservado + LOTE, "Reserva") };
}
module.exports = { LOTE, reservar };
