"use strict";
// OPCIONAL (11/11/2026): bloqueia a própria criação de contas no Firebase Authentication enquanto
// configuracoes/seguranca.cadastrosSuspensos não for `false`. Só funciona depois de ativar
// "Firebase Authentication with Identity Platform" no projeto (Consola > Authentication > Settings).
// Para usar: em index.js acrescentar  exports.bloquearNovasContas = require("./bloqueioCadastroAuth").bloquearNovasContas;
const { beforeUserCreated, HttpsError } = require("firebase-functions/v2/identity");
const { getFirestore } = require("firebase-admin/firestore");

exports.bloquearNovasContas = beforeUserCreated({ region: "europe-west1" }, async () => {
  const snap = await getFirestore().collection("configuracoes").doc("seguranca").get();
  const d = snap.exists ? snap.data() : {};
  if (d.cadastrosSuspensos !== false) {
    throw new HttpsError("permission-denied", "Novos cadastros temporariamente suspensos para manutenção de segurança.");
  }
});
