"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { calcularCobrancaParcela } = require("./lib/calculoParcela");

if (!getApps().length) initializeApp();

function texto(valor, maximo) {
  return typeof valor === "string" && valor.trim().length > 0 && valor.trim().length <= maximo;
}

exports.criarPerfilUsuario = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
    const dados = request.data || {};
    const campos = ["nome", "telefone", "cpf", "pais", "dataNascimento", "profissao", "cidade", "estado"];
    if (!campos.every((campo) => texto(dados[campo], 120)) || !texto(dados.email, 254)) {
      throw new HttpsError("invalid-argument", "Dados de cadastro inválidos.");
    }
    if (dados.email.trim().toLowerCase() !== String(request.auth.token.email || "").toLowerCase()) {
      throw new HttpsError("permission-denied", "O e-mail precisa corresponder à conta autenticada.");
    }
    if (!["BR", "PT"].includes(dados.pais)) {
      throw new HttpsError("invalid-argument", "País inválido.");
    }
    const db = getFirestore();
    const perfilRef = db.collection("usuarios").doc(request.auth.uid);
    const cpf = dados.cpf.trim();
    const existente = await db.collection("usuarios").where("cpf", "==", cpf).limit(1).get();
    if (!existente.empty && existente.docs[0].id !== request.auth.uid) {
      throw new HttpsError("already-exists", "Este CPF/NIF já está cadastrado.");
    }
    const codigoDigitado = String(dados.codigoIndicacao || "").trim().toUpperCase();
    const indicador = codigoDigitado
      ? await db.collection("usuarios").where("codigoIndicacao", "==", codigoDigitado).limit(1).get()
      : null;
    const codigo = `${dados.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6) || "USER"}${Math.floor(100000 + Math.random() * 900000)}`;
    await perfilRef.set({
      nome: dados.nome.trim(), email: dados.email.trim(), telefone: dados.telefone.trim(), cpf,
      pais: dados.pais, moeda: dados.pais === "PT" ? "€" : "R$", dataNascimento: dados.dataNascimento.trim(),
      pix: String(dados.pix || "").trim(), profissao: dados.profissao.trim(), cidade: dados.cidade.trim(), estado: dados.estado.trim(),
      score: 20, nivel: "Essencial", limiteBase: 100, status: "ativo", isaCoins: 0, diasLembrete: 3,
      codigoIndicacao: codigo, indicadoPor: indicador && !indicador.empty ? indicador.docs[0].id : null,
      indicacaoPremiada: false, criadoEm: FieldValue.serverTimestamp()
    }, { merge: false });
    return { codigoIndicacao: codigo };
  }
);

exports.recalcularParcelaVencida = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
    }

    const parcelaId = String(request.data?.parcelaId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(parcelaId)) {
      throw new HttpsError("invalid-argument", "Parcela inválida.");
    }

    const db = getFirestore();
    const parcelaRef = db.collection("parcelas").doc(parcelaId);
    const [parcelaSnap, adminSnap] = await Promise.all([
      parcelaRef.get(),
      db.collection("admins").doc(request.auth.uid).get()
    ]);

    if (!parcelaSnap.exists) {
      throw new HttpsError("not-found", "Parcela não encontrada.");
    }

    const parcela = parcelaSnap.data();
    const autorizado = adminSnap.exists || parcela.userId === request.auth.uid;
    if (!autorizado) {
      throw new HttpsError("permission-denied", "Sem permissão para esta parcela.");
    }

    let cobranca;
    try {
      cobranca = calcularCobrancaParcela(parcela);
    } catch (erro) {
      throw new HttpsError("failed-precondition", erro.message);
    }

    await parcelaRef.update({
      ...cobranca,
      cobrancaCalculadaEm: FieldValue.serverTimestamp()
    });

    return cobranca;
  }
);
