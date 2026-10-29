"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { calcularCobrancaParcela } = require("./lib/calculoParcela");
const { limiteEfetivo, REGRAS_CREDITO } = require("./lib/limiteCredito");
const { reservar: reservarIsaCoins } = require("./lib/isaCoins");

if (!getApps().length) initializeApp();

function texto(valor, maximo) {
  return typeof valor === "string" && valor.trim().length > 0 && valor.trim().length <= maximo;
}

function textoOpcional(valor, maximo) {
  return valor == null || (typeof valor === "string" && valor.trim().length <= maximo);
}

function documentoValido(valor, pais) {
  const numeros = String(valor || "").replace(/\D/g, "");
  return (pais === "BR" && numeros.length === 11) || (pais === "PT" && numeros.length === 9);
}

function dataNascimentoValida(valor) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(valor || ""))) return false;
  const [dia, mes, ano] = valor.split("/").map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return false;
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  if (hoje.getMonth() < mes - 1 || (hoje.getMonth() === mes - 1 && hoje.getDate() < dia)) idade -= 1;
  return idade >= 18 && idade <= 120;
}

function regrasDeCredito(nivel) {
  return REGRAS_CREDITO[nivel] || REGRAS_CREDITO.Essencial;
}

// O score é a fonte de verdade para a faixa do cliente.  O campo `nivel`
// antigo pode existir em cadastros anteriores, mas não pode decidir uma
// solicitação porque ele ficava desatualizado quando o administrador mudava
// apenas o score.
function nivelPorScore(score) {
  const numero = Number(score);
  if (!Number.isFinite(numero) || numero <= 20) return "Essencial";
  if (numero <= 40) return "Bronze";
  if (numero <= 60) return "Prata";
  if (numero <= 80) return "Ouro";
  return "Black";
}

// Alerta para o Telegram: o cliente não pode escrever em `notificacoes`
// (regras do Firestore), então a fila é sempre alimentada pelo servidor.
function alertaTelegram(uid, tipo, id) {
  return {
    userId: uid, titulo: "", mensagem: "", lida: true, telegramInterno: true,
    tipoTelegram: tipo, dadosTelegram: { id: id || null }, criadoPor: uid,
    data: FieldValue.serverTimestamp(), statusTelegram: "pendente"
  };
}

async function codigoIndicacaoUnico(db, nome) {
  const base = String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 6) || "USER";
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const codigo = `${base}${Math.floor(100000 + Math.random() * 900000)}`;
    const existe = await db.collection("usuarios").where("codigoIndicacao", "==", codigo).limit(1).get();
    if (existe.empty) return codigo;
  }
  throw new HttpsError("aborted", "Não foi possível gerar um código de indicação. Tente novamente.");
}

exports.criarPerfilUsuario = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
    const dados = request.data || {};
    const campos = ["nome", "telefone", "cpf", "pais", "dataNascimento"];
    if (!campos.every((campo) => texto(dados[campo], 120)) || !texto(dados.email, 254) ||
      !textoOpcional(dados.profissao, 120) || !textoOpcional(dados.cidade, 120) || !textoOpcional(dados.estado, 120)) {
      throw new HttpsError("invalid-argument", "Dados de cadastro inválidos.");
    }
    if (dados.email.trim().toLowerCase() !== String(request.auth.token.email || "").toLowerCase()) {
      throw new HttpsError("permission-denied", "O e-mail precisa corresponder à conta autenticada.");
    }
    if (!["BR", "PT"].includes(dados.pais)) {
      throw new HttpsError("invalid-argument", "País inválido.");
    }
    if (!documentoValido(dados.cpf, dados.pais) || !dataNascimentoValida(dados.dataNascimento)) {
      throw new HttpsError("invalid-argument", "CPF/NIF ou data de nascimento inválidos.");
    }
    const db = getFirestore();
    const perfilRef = db.collection("usuarios").doc(request.auth.uid);
    const cpf = String(dados.cpf).replace(/\D/g, "");
    const existente = await db.collection("usuarios").where("cpf", "==", cpf).limit(1).get();
    if (!existente.empty && existente.docs[0].id !== request.auth.uid) {
      throw new HttpsError("already-exists", "Este CPF/NIF já está cadastrado.");
    }
    const codigoDigitado = String(dados.codigoIndicacao || "").trim().toUpperCase();
    const indicador = codigoDigitado
      ? await db.collection("usuarios").where("codigoIndicacao", "==", codigoDigitado).limit(1).get()
      : null;
    const codigo = await codigoIndicacaoUnico(db, dados.nome);
    await perfilRef.set({
      nome: dados.nome.trim(), email: dados.email.trim(), telefone: dados.telefone.trim(), cpf,
      pais: dados.pais, moeda: dados.pais === "PT" ? "€" : "R$", dataNascimento: dados.dataNascimento.trim(),
      pix: String(dados.pix || "").trim(), profissao: String(dados.profissao || "").trim(), cidade: String(dados.cidade || "").trim(), estado: String(dados.estado || "").trim(),
      score: 20, nivel: "Essencial", limiteBase: dados.pais === "PT" ? 100 : 300, limiteManual: false, status: "ativo", isaCoins: 0, diasLembrete: 3,
      codigoIndicacao: codigo, indicadoPor: indicador && !indicador.empty ? indicador.docs[0].id : null,
      indicacaoPremiada: false, criadoEm: FieldValue.serverTimestamp()
    }, { merge: false });
    await db.collection("notificacoes").add(alertaTelegram(request.auth.uid, "cadastro", null));
    return { codigoIndicacao: codigo };
  }
);

exports.solicitarCredito = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
    const valor = Number(request.data?.valor);
    const parcelas = Number(request.data?.parcelas);
    const avalista = request.data?.avalista || {};
    if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12 ||
      !texto(avalista.nome, 120) || !texto(avalista.telefone, 30) || !texto(avalista.cpf, 30)) {
      throw new HttpsError("invalid-argument", "Dados da solicitação inválidos.");
    }
    const db = getFirestore();
    const userRef = db.collection("usuarios").doc(request.auth.uid);
    const emprestimosRef = db.collection("emprestimos");
    const resultado = await db.runTransaction(async (tx) => {
      const usuarioSnap = await tx.get(userRef);
      if (!usuarioSnap.exists) throw new HttpsError("failed-precondition", "Cadastro não encontrado.");
      const usuario = usuarioSnap.data();
      if (usuario.status !== "ativo") throw new HttpsError("permission-denied", "Conta indisponível para solicitação.");
      const bloqueio = usuario.bloqueadoSolicitacaoAte?.toDate?.() || null;
      if (bloqueio && bloqueio > new Date()) throw new HttpsError("failed-precondition", "Há um bloqueio temporário para nova solicitação.");
      if (!usuario.nome || !usuario.telefone || !usuario.cpf || !usuario.pix) throw new HttpsError("failed-precondition", "Complete seu cadastro antes de solicitar crédito.");
      const pendentes = await tx.get(emprestimosRef.where("userId", "==", request.auth.uid).where("status", "==", "aguardando").limit(1));
      if (!pendentes.empty) throw new HttpsError("already-exists", "Já existe uma solicitação em análise.");
      const pais = usuario.pais === "PT" ? "PT" : "BR";
      const minimo = pais === "PT" ? 30 : 100;
      const nivelCalculado = nivelPorScore(usuario.score);
      const regra = regrasDeCredito(nivelCalculado);
      const taxa = regra.juros[parcelas];
      const limite = limiteEfetivo(usuario, pais, nivelCalculado);
      if (valor < minimo || valor > limite || !taxa || parcelas > regra.maxParcelas) {
        throw new HttpsError("invalid-argument", "Valor ou parcelamento não permitido para este perfil.");
      }
      const juros = Number((valor * taxa).toFixed(2));
      const ref = emprestimosRef.doc();
      tx.create(ref, {
        userId: request.auth.uid, email: request.auth.token.email || "", pais, moeda: pais === "PT" ? "€" : "R$",
        nomeCliente: usuario.nome, telefoneCliente: usuario.telefone, cpfCliente: usuario.cpf, pixCliente: usuario.pix,
        nomeAvalista: avalista.nome.trim(), telefoneAvalista: avalista.telefone.trim(), cpfAvalista: String(avalista.cpf).trim(),
        valor, parcelas, juros, valorFinal: Number((valor + juros).toFixed(2)), status: "aguardando",
        criadoEm: FieldValue.serverTimestamp(), dataAprovacao: null, dataVencimento: null
      });
      tx.create(db.collection("notificacoes").doc(), alertaTelegram(request.auth.uid, "emprestimo", ref.id));
      return { id: ref.id };
    });
    return resultado;
  }
);

exports.solicitarSaque = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB", maxInstances: 20, concurrency: 80, cpu: 1 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
    const db = getFirestore();
    const userRef = db.collection("usuarios").doc(request.auth.uid);
    const resultado = await db.runTransaction(async (tx) => {
      const usuarioSnap = await tx.get(userRef);
      if (!usuarioSnap.exists) throw new HttpsError("failed-precondition", "Cadastro não encontrado.");
      const usuario = usuarioSnap.data();
      const saldo = Number(usuario.isaCoins || 0);
      if (!Number.isFinite(saldo) || saldo < 10000 || !texto(usuario.pix, 120)) throw new HttpsError("failed-precondition", "Você não tem saldo disponível ou chave de pagamento cadastrada.");
      const pendente = await tx.get(db.collection("saques").where("userId", "==", request.auth.uid).where("status", "==", "pendente").limit(1));
      if (!pendente.empty) throw new HttpsError("already-exists", "Já existe uma solicitação de saque em andamento.");
      let reserva;
      try { reserva = reservarIsaCoins(usuario); }
      catch { throw new HttpsError("failed-precondition", "Saldo de moedas inconsistente; solicite conferência ao administrador."); }
      const { pais, valor } = reserva;
      const ref = db.collection("saques").doc();
      tx.update(userRef, { isaCoins: reserva.saldo, isaCoinsReservadas: reserva.reservado });
      tx.create(ref, { userId: request.auth.uid, nomeCliente: usuario.nome || "", telefoneCliente: usuario.telefone || "", pix: usuario.pix,
        isaCoins: reserva.moedas, valor, moeda: pais === "PT" ? "EUR" : "BRL", pais, status: "pendente", moedasReservadas: true, versaoMoedas: 2, criadoEm: FieldValue.serverTimestamp() });
      tx.create(db.collection("notificacoes").doc(), alertaTelegram(request.auth.uid, "saque", ref.id));
      return { id: ref.id, isaCoins: reserva.moedas, saldoRestante: reserva.saldo, valor, pais, nome: usuario.nome || "", pix: usuario.pix };
    });
    return resultado;
  }
);

exports.registrarEventoCliente = onCall(
  { region: "europe-west1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "É necessário iniciar sessão.");
    const tipo = String(request.data?.tipo || "");
    const dados = request.data?.dados || {};
    const permitidos = ["atendimento", "negociacao", "pagamento_aberto", "pagamento_confirmado"];
    if (!permitidos.includes(tipo)) throw new HttpsError("invalid-argument", "Tipo de solicitação inválido.");
    const db = getFirestore();
    const id = String(dados.id || "");
    if (["pagamento_aberto", "pagamento_confirmado"].includes(tipo)) {
      const parcela = await db.collection("parcelas").doc(id).get();
      if (!parcela.exists || parcela.data().userId !== request.auth.uid) throw new HttpsError("permission-denied", "Parcela inválida.");
    }
    if (tipo === "negociacao") {
      const negociacao = await db.collection("negociacoes").doc(id).get();
      if (!negociacao.exists || negociacao.data().userId !== request.auth.uid) throw new HttpsError("permission-denied", "Negociação inválida.");
    }
    await db.collection("notificacoes").add(alertaTelegram(request.auth.uid, tipo, id));
    return { ok: true };
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
