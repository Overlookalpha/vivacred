import json
import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

# Roda antes de processar_telegram.py no mesmo job. Detecta parcelas que
# venceram e ainda não foram pagas/quitadas, e enfileira UM alerta por
# parcela (nunca repete, graças à marca alertaAtrasoEnviado).
#
# Firestore não permite duas desigualdades em campos diferentes na mesma
# consulta, então filtramos por igualdade no servidor (status == "pendente",
# que é o único status não-terminal usado no app — confirmado em admin.html)
# e aplicamos o restante do filtro (vencimento no passado, ainda não
# alertado) em Python.

LIMITE_POR_EXECUCAO = 200


def vencimento_como_data(valor):
    if valor is None:
        return None
    if hasattr(valor, "timestamp"):
        return valor
    try:
        return datetime.fromisoformat(str(valor))
    except ValueError:
        return None


def main():
    conta = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    try:
        firebase_admin.initialize_app(credentials.Certificate(conta))
    except ValueError:
        pass  # já inicializado (execução compartilhada com outro script)
    db = firestore.client()

    agora = datetime.now(timezone.utc)
    novos_alertas = 0
    verificadas = 0

    for snap in db.collection("parcelas").where("status", "==", "pendente").stream():
        verificadas += 1
        item = snap.to_dict() or {}

        if item.get("alertaAtrasoEnviado") is True:
            continue

        vencimento = vencimento_como_data(item.get("vencimento"))
        if vencimento is None:
            continue

        venceu = vencimento.timestamp() < agora.timestamp() if hasattr(vencimento, "timestamp") else False
        if not venceu:
            continue

        user_id = item.get("userId")
        if not user_id:
            continue

        db.collection("notificacoes").add({
            "userId": user_id,
            "titulo": "",
            "mensagem": "",
            "lida": True,
            "telegramInterno": True,
            "tipoTelegram": "parcela_atrasada",
            "dadosTelegram": {"id": snap.id},
            "criadoPor": user_id,
            "data": firestore.SERVER_TIMESTAMP,
            "statusTelegram": "pendente"
        })

        snap.reference.update({"alertaAtrasoEnviado": True})

        novos_alertas += 1
        if novos_alertas >= LIMITE_POR_EXECUCAO:
            break

    print(f"Parcelas pendentes verificadas: {verificadas}; novos alertas de atraso: {novos_alertas}")


if __name__ == "__main__":
    main()
