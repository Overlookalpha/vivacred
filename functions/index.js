"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { calcularCobrancaParcela } = require("./lib/calculoParcela");

if (!getApps().length) initializeApp();

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
