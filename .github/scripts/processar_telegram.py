import json
import os

import firebase_admin
import requests
from firebase_admin import credentials, firestore


def moeda(valor, pais):
    simbolo = "€" if pais == "PT" else "R$"
    return f"{simbolo}{float(valor or 0):.2f}"


def carregar_do_usuario(db, colecao, registro_id, uid):
    if not registro_id:
        raise ValueError("Identificador ausente")
    snap = db.collection(colecao).document(str(registro_id)).get()
    if not snap.exists:
        raise ValueError("Registro não encontrado")
    dados = snap.to_dict() or {}
    if dados.get("userId") != uid and dados.get("indicadoPor") != uid:
        raise ValueError("Registro não pertence ao usuário")
    return dados


def mensagem_cliente(db, tipo, dados_evento, uid):
    usuario_snap = db.collection("usuarios").document(uid).get()
    usuario = usuario_snap.to_dict() or {} if usuario_snap.exists else {}
    nome = usuario.get("nome") or usuario.get("email") or "Cliente"
    email = usuario.get("email") or "Não informado"
    telefone = usuario.get("telefone") or "Não informado"

    if tipo == "atendimento":
        return (
            "💬 SOLICITAÇÃO DE ATENDIMENTO ISACRED\n\n"
            f"👤 Cliente: {nome}\n📧 E-mail: {email}\n📱 Telefone: {telefone}\n\n"
            f"🌍 País: {usuario.get('pais') or 'BR'}\n⭐ Score: {int(usuario.get('score') or 20)}\n\n"
            "📌 Motivo:\nCliente solicitou atendimento para alteração de renda ou revisão de limite."
        )

    if tipo == "emprestimo":
        item = carregar_do_usuario(db, "emprestimos", dados_evento.get("id"), uid)
        pais = item.get("pais") or "BR"
        return (
            "🚨 NOVA SOLICITAÇÃO ISA CRED\n\n"
            f"👤 Cliente: {item.get('nomeCliente') or nome}\n"
            f"📧 Email: {item.get('email') or email}\n"
            f"📱 Telefone: {item.get('telefoneCliente') or telefone}\n"
            f"🌍 País: {pais}\n💰 Valor: {moeda(item.get('valor'), pais)}\n"
            f"📊 Parcelas: {item.get('parcelas')}x\n"
            f"👨 Avalista: {item.get('nomeAvalista') or 'Não informado'}\n"
            f"📞 Avalista: {item.get('telefoneAvalista') or 'Não informado'}\n\n"
            "⏳ Status: AGUARDANDO ANÁLISE"
        )

    if tipo == "negociacao":
        item = carregar_do_usuario(db, "negociacoes", dados_evento.get("id"), uid)
        return (
            "📞 PEDIDO DE NEGOCIAÇÃO\n\n"
            f"👤 Cliente: {item.get('nomeCliente') or nome}\n"
            f"📱 Telefone: {item.get('telefoneCliente') or telefone}\n\n"
            f"📄 Parcela: {item.get('numeroParcela') or '-'}\n\n"
            f"💬 Motivo:\n{item.get('motivo') or 'Não informado'}"
        )

    if tipo == "indicacao":
        item = carregar_do_usuario(db, "indicacoes", dados_evento.get("id"), uid)
        return (
            "👨‍👩‍👧 NOVA INDICAÇÃO\n\n"
            f"Indicado por: {item.get('nomeIndicador') or nome}\n\n"
            f"👤 Nome do parente: {item.get('nomeIndicado') or 'Não informado'}\n"
            f"📱 Telefone: {item.get('telefoneIndicado') or 'Não informado'}"
        )

    if tipo in ("pagamento_aberto", "pagamento_confirmado"):
        item = carregar_do_usuario(db, "parcelas", dados_evento.get("id"), uid)
        pais = item.get("pais") or usuario.get("pais") or "BR"
        valor = moeda(item.get("restante") or item.get("valor"), pais)
        if tipo == "pagamento_aberto":
            return (
                "👀 CLIENTE ABRIU PAGAMENTO\n\n"
                f"👤 Cliente: {nome}\n📱 Telefone: {telefone}\n\n"
                f"📄 Parcela: {item.get('numero')}\n💰 Valor: {valor}\n🌍 País: {pais}\n\n"
                "⏳ Status: abriu a tela de pagamento e pode estar efetuando o pagamento."
            )
        comprovante = item.get("comprovanteUrl")
        anexo = f"📎 Comprovante: {comprovante}" if comprovante else "📎 Comprovante: não anexado"
        return (
            "✅ CLIENTE CONFIRMOU PAGAMENTO\n\n"
            f"👤 Cliente: {nome}\n📱 Telefone: {telefone}\n\n"
            f"📄 Parcela: {item.get('numero')}\n💰 Valor: {valor}\n🌍 País: {pais}\n\n"
            f"{anexo}\n\n⏳ Status: cliente informou que realizou o pagamento. Aguardando conferência."
        )

    raise ValueError("Evento não permitido")


def montar_mensagem(db, evento):
    tipo = str(evento.get("tipo") or "")
    uid = str(evento.get("criadoPor") or "")
    dados = evento.get("dados") or {}
    if tipo == "admin_texto":
        if not uid or not db.collection("admins").document(uid).get().exists:
            raise ValueError("Administrador não autorizado")
        texto = str(dados.get("texto") or "").strip()
        if not texto or len(texto) > 4000:
            raise ValueError("Mensagem administrativa inválida")
        return texto
    return mensagem_cliente(db, tipo, dados, uid)


def main():
    conta = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    firebase_admin.initialize_app(credentials.Certificate(conta))
    db = firestore.client()
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    pendentes = db.collection("filaTelegram").where("status", "==", "pendente").limit(50).stream()
    for snap in pendentes:
        ref = snap.reference
        try:
            ref.update({"status": "processando"})
            texto = montar_mensagem(db, snap.to_dict() or {})
            resposta = requests.post(url, json={"chat_id": chat_id, "text": texto}, timeout=20)
            resposta.raise_for_status()
            retorno = resposta.json()
            if not retorno.get("ok"):
                raise RuntimeError(retorno.get("description") or "Telegram recusou a mensagem")
            ref.update({"status": "enviado", "enviadoEm": firestore.SERVER_TIMESTAMP})
        except Exception as erro:
            ref.update({"status": "erro", "erro": str(erro)[:300], "processadoEm": firestore.SERVER_TIMESTAMP})


if __name__ == "__main__":
    main()
