import json
import os
import unicodedata

import firebase_admin
from firebase_admin import credentials, firestore


NOMES_REAIS = {
    "sirlei",
    "tatiane",
    "douglas andreola de carvalho",
    "douglas de carvalho",
    "andre henrique rodrigues",
    "andre henriques rodrigues",
    "jose carlos de souza orvieto",
    "carlos orviedo",
    "pedro dionisio de chaves ribeiro",
    "rosane figueira",
    "katia viviane de azevedo",
    "catia viviande de azevedo",
}

EMAILS_REAIS = {
    "sirlei@isacred.com",
    "tatiane@isacred.com",
    "douglas@isacred.com",
    "andre@isacred.com",
    "carlos@isacred.com",
    "pedro@isacred.com",
    "rosane@isacred.com",
    "viviane@isacred.com",
}


def normalizar(valor):
    texto = unicodedata.normalize("NFD", str(valor or ""))
    texto = "".join(letra for letra in texto if not unicodedata.combining(letra))
    return " ".join(texto.strip().lower().split())


def executar_lotes(operacoes, tamanho=400):
    for inicio in range(0, len(operacoes), tamanho):
        lote = db.batch()
        for referencia, dados in operacoes[inicio : inicio + tamanho]:
            lote.set(referencia, dados, merge=True)
        lote.commit()


credencial_json = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
firebase_admin.initialize_app(credentials.Certificate(credencial_json))
db = firestore.client()

controle_ref = db.collection("configuracoes").document("classificacaoTestes202609")
controle = controle_ref.get()

if controle.exists and (controle.to_dict() or {}).get("concluida") is True:
    print("Classificacao ja estava concluida:", controle.to_dict())
    raise SystemExit(0)

classificacao_por_id = {}
operacoes = []
reais = 0
testes = 0

for documento in db.collection("emprestimos").stream():
    dados = documento.to_dict() or {}
    # Não deduza uma classificação financeira a partir de nome ou e-mail.
    # Registros sem uma classificação revisada ficam intactos até uma decisão
    # explícita do administrador.
    tipo = dados.get("tipoRegistro")
    if tipo not in {"real", "teste"}:
        continue
    classificacao_por_id[documento.id] = tipo
    reais += tipo == "real"
    testes += tipo == "teste"
    operacoes.append(
        (
            documento.reference,
            {
                "tipoRegistro": tipo,
                "teste": tipo == "teste",
                "classificadoEm": firestore.SERVER_TIMESTAMP,
                "classificacao": "limpeza_confirmada_2026_09",
            },
        )
    )

executar_lotes(operacoes)

operacoes = []
parcelas_classificadas = 0
for documento in db.collection("parcelas").stream():
    dados = documento.to_dict() or {}
    tipo = classificacao_por_id.get(dados.get("emprestimoId"))
    if not tipo:
        continue
    operacoes.append(
        (documento.reference, {"tipoRegistro": tipo, "teste": tipo == "teste"})
    )
    parcelas_classificadas += 1

executar_lotes(operacoes)

controle_ref.set(
    {
        "concluida": True,
        "executadaEm": firestore.SERVER_TIMESTAMP,
        "reais": reais,
        "testes": testes,
        "parcelasClassificadas": parcelas_classificadas,
    }
)

print(
    f"Classificacao concluida: {reais} reais, {testes} testes, "
    f"{parcelas_classificadas} parcelas."
)
