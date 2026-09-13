const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const ORIGEM_SITE = "https://overlookalpha.github.io";

function dinheiro(valor, pais){
  return (pais === "PT" ? "€" : "R$") + Number(valor || 0).toFixed(2);
}

async function documentoDoUsuario(colecao, id, uid){
  if (!id) throw new Error("Identificador ausente");
  const snap = await db.collection(colecao).doc(String(id)).get();
  if (!snap.exists) throw new Error("Registro não encontrado");
  const dados = snap.data() || {};
  if (dados.userId !== uid && dados.indicadoPor !== uid) {
    throw new Error("Registro não pertence ao usuário");
  }
  return { id: snap.id, ...dados };
}

async function mensagemDoCliente(tipo, dados, uid, email){
  const usuarioSnap = await db.collection("usuarios").doc(uid).get();
  const usuario = usuarioSnap.exists ? usuarioSnap.data() || {} : {};
  const nome = usuario.nome || email || "Cliente";
  const telefone = usuario.telefone || "Não informado";

  if (tipo === "atendimento") {
    return `💬 SOLICITAÇÃO DE ATENDIMENTO ISACRED\n\n👤 Cliente: ${nome}\n📧 E-mail: ${email || "Não informado"}\n📱 Telefone: ${telefone}\n\n🌍 País: ${usuario.pais || "BR"}\n⭐ Score: ${Number(usuario.score || 20)}\n\n📌 Motivo:\nCliente solicitou atendimento para alteração de renda ou revisão de limite.`;
  }

  if (tipo === "emprestimo") {
    const emp = await documentoDoUsuario("emprestimos", dados.id, uid);
    return `🚨 NOVA SOLICITAÇÃO ISA CRED\n\n👤 Cliente: ${emp.nomeCliente || nome}\n📧 Email: ${emp.email || email}\n📱 Telefone: ${emp.telefoneCliente || telefone}\n🌍 País: ${emp.pais || "BR"}\n💰 Valor: ${dinheiro(emp.valor, emp.pais)}\n📊 Parcelas: ${emp.parcelas}x\n👨 Avalista: ${emp.nomeAvalista || "Não informado"}\n📞 Avalista: ${emp.telefoneAvalista || "Não informado"}\n\n⏳ Status: AGUARDANDO ANÁLISE`;
  }

  if (tipo === "negociacao") {
    const item = await documentoDoUsuario("negociacoes", dados.id, uid);
    return `📞 PEDIDO DE NEGOCIAÇÃO\n\n👤 Cliente: ${item.nomeCliente || nome}\n📱 Telefone: ${item.telefoneCliente || telefone}\n\n📄 Parcela: ${item.numeroParcela || "-"}\n\n💬 Motivo:\n${item.motivo || "Não informado"}`;
  }

  if (tipo === "indicacao") {
    const item = await documentoDoUsuario("indicacoes", dados.id, uid);
    return `👨‍👩‍👧 NOVA INDICAÇÃO\n\nIndicado por: ${item.nomeIndicador || nome}\n\n👤 Nome do parente: ${item.nomeIndicado || "Não informado"}\n📱 Telefone: ${item.telefoneIndicado || "Não informado"}`;
  }

  if (tipo === "pagamento_aberto" || tipo === "pagamento_confirmado") {
    const parcela = await documentoDoUsuario("parcelas", dados.id, uid);
    const pais = parcela.pais || usuario.pais || "BR";
    const valor = dinheiro(parcela.restante || parcela.valor, pais);
    if (tipo === "pagamento_aberto") {
      return `👀 CLIENTE ABRIU PAGAMENTO\n\n👤 Cliente: ${nome}\n📱 Telefone: ${telefone}\n\n📄 Parcela: ${parcela.numero}\n💰 Valor: ${valor}\n🌍 País: ${pais}\n\n⏳ Status: abriu a tela de pagamento e pode estar efetuando o pagamento.`;
    }
    return `✅ CLIENTE CONFIRMOU PAGAMENTO\n\n👤 Cliente: ${nome}\n📱 Telefone: ${telefone}\n\n📄 Parcela: ${parcela.numero}\n💰 Valor: ${valor}\n🌍 País: ${pais}\n\n${parcela.comprovanteUrl ? "📎 Comprovante: " + parcela.comprovanteUrl : "📎 Comprovante: não anexado"}\n\n⏳ Status: cliente informou que realizou o pagamento. Aguardando conferência.`;
  }

  throw new Error("Evento não permitido");
}

exports.enviarTelegram = onRequest(
  { region: "europe-west1", cors: [ORIGEM_SITE] },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ ok: false, erro: "Método não permitido" });
      return;
    }

    try {
      const authorization = request.get("Authorization") || "";
      if (!authorization.startsWith("Bearer ")) {
        response.status(401).json({ ok: false, erro: "Login necessário" });
        return;
      }

      const identidade = await getAuth().verifyIdToken(authorization.slice(7));
      const tipo = String(request.body?.tipo || "");
      const dados = request.body?.dados || {};
      let texto;

      if (tipo === "admin_texto") {
        const admin = await db.collection("admins").doc(identidade.uid).get();
        if (!admin.exists) throw new Error("Acesso administrativo necessário");
        texto = String(dados.texto || "").trim();
        if (!texto || texto.length > 4000) throw new Error("Mensagem inválida");
      } else {
        texto = await mensagemDoCliente(tipo, dados, identidade.uid, identidade.email);
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!token || !chatId) throw new Error("Telegram não configurado no servidor");

      const telegram = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: texto })
      });
      const resultado = await telegram.json();
      if (!telegram.ok || !resultado.ok) throw new Error(resultado.description || "Telegram recusou a mensagem");

      response.json({ ok: true });
    } catch (erro) {
      console.error("Erro ao enviar Telegram:", erro);
      response.status(403).json({ ok: false, erro: "Aviso não autorizado ou indisponível" });
    }
  }
);
