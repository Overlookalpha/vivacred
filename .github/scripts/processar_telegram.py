import json
import os
from datetime import datetime, timedelta, timezone

import firebase_admin
import requests
from firebase_admin import credentials, firestore

# Execução de recuperação: processa também os alertas presos após o login.


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

    if tipo == "cadastro":
        indicador = ""
        if usuario.get("indicadoPor"):
            indicador = "\n🤝 Cadastro realizado por indicação"
        return (
            "🆕 NOVA CONTA ISACRED\n\n"
            f"👤 Cliente: {nome}\n"
            f"📧 E-mail: {email}\n"
            f"📱 Telefone: {telefone}\n"
            f"🌍 País: {usuario.get('pais') or 'BR'}\n"
            f"📍 Cidade: {usuario.get('cidade') or 'Não informada'}\n"
            f"⭐ Score inicial: {int(usuario.get('score') or 20)}"
            f"{indicador}\n\n"
            "✅ Status: conta criada e disponível para análise."
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
    tipo = str(evento.get("tipoTelegram") or "")
    uid = str(evento.get("criadoPor") or "")
    dados = evento.get("dadosTelegram") or {}
    if tipo == "admin_texto":
        if not uid or not db.collection("admins").document(uid).get().exists:
            raise ValueError("Administrador não autorizado")
        texto = str(dados.get("texto") or "").strip()
        if not texto or len(texto) > 4000:
            raise ValueError("Mensagem administrativa inválida")
        return texto
    return mensagem_cliente(db, tipo, dados, uid)


LIMITE_POR_EXECUCAO = 50
MAX_TENTATIVAS = 3


def horario_pronto(valor, agora):
    """Retorna se a mensagem pode ser tentada agora.

    Registros antigos não tinham data de tentativa; eles são tratados como
    prontos para recuperar a fila que existia antes desta correção.
    """
    if valor is None:
        return True
    if hasattr(valor, "timestamp"):
        return valor <= agora
    return True


def main():
    conta = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    firebase_admin.initialize_app(credentials.Certificate(conta))
    db = firestore.client()
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    url = f"https://api.telegram.org/bot{token}/sendMessage"

    agora = datetime.now(timezone.utc)
    limite_processando = agora - timedelta(minutes=15)
    candidatos = []
    vistos = set()

    # Pendente inclui tentativas novas e as que aguardam a próxima janela.
    for snap in db.collection("notificacoes").where("statusTelegram", "==", "pendente").limit(LIMITE_POR_EXECUCAO).stream():
        evento = snap.to_dict() or {}
        if horario_pronto(evento.get("proximaTentativaTelegramEm"), agora):
            candidatos.append(snap)
            vistos.add(snap.id)

    # Recupera uma execução interrompida antes de marcar o alerta como enviado.
    for snap in db.collection("notificacoes").where("statusTelegram", "==", "processando").limit(LIMITE_POR_EXECUCAO).stream():
        evento = snap.to_dict() or {}
        iniciou = evento.get("processandoEm")
        if (iniciou is None or iniciou <= limite_processando) and snap.id not in vistos:
            candidatos.append(snap)
            vistos.add(snap.id)

    pendentes = candidatos[:LIMITE_POR_EXECUCAO]
    print(f"Alertas prontos para envio: {len(pendentes)}")
    enviados = 0
    erros = 0
    for snap in pendentes:
        ref = snap.reference
        evento = snap.to_dict() or {}
        tentativas = int(evento.get("tentativasTelegram") or 0) + 1
        try:
            ref.update({
                "statusTelegram": "processando",
                "processandoEm": firestore.SERVER_TIMESTAMP,
                "tentativasTelegram": tentativas
            })
            texto = montar_mensagem(db, evento)
            resposta = requests.post(url, json={"chat_id": chat_id, "text": texto}, timeout=20)
            resposta.raise_for_status()
            retorno = resposta.json()
            if not retorno.get("ok"):
                raise RuntimeError(retorno.get("description") or "Telegram recusou a mensagem")
            ref.update({
                "statusTelegram": "enviado",
                "enviadoEm": firestore.SERVER_TIMESTAMP,
                "erroTelegram": firestore.DELETE_FIELD,
                "proximaTentativaTelegramEm": firestore.DELETE_FIELD
            })
            enviados += 1
        except Exception as erro:
            mensagem_erro = str(erro)[:300]
            if tentativas < MAX_TENTATIVAS:
                espera = 15 * (2 ** (tentativas - 1))
                ref.update({
                    "statusTelegram": "pendente",
                    "erroTelegram": mensagem_erro,
                    "proximaTentativaTelegramEm": agora + timedelta(minutes=espera),
                    "processadoEm": firestore.SERVER_TIMESTAMP
                })
            else:
                ref.update({
                    "statusTelegram": "erro",
                    "erroTelegram": mensagem_erro,
                    "processadoEm": firestore.SERVER_TIMESTAMP
                })
            erros += 1
    print(f"Alertas enviados: {enviados}; alertas com erro: {erros}")


if __name__ == "__main__":
    main()
