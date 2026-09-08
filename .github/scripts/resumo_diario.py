"""
Script do resumo diario do VivaCred, enviado no Telegram do admin.

Roda uma vez por dia via GitHub Actions (ver
.github/workflows/resumo-diario.yml), 100% na nuvem - nao depende do
computador de ninguem estar ligado.

Junta num unico resumo diario: pagamentos em aberto, pagamentos vencendo
(hoje / amanha / em 2-3 dias / atrasados), aniversariantes de hoje e dos
proximos 7 dias, clientes perto de bater 10.000 ISAcoins, dinheiro na rua,
dinheiro em caixa e o melhor cliente (maior nota de credito).

A logica de calculo (aniversario, multa/juros de atraso, dinheiro na rua,
caixa disponivel) replica exatamente a mesma logica ja usada no admin.html
do VivaCred, pra os numeros baterem com o painel.
"""

import json
import os
from datetime import date, datetime, timedelta

import firebase_admin
import requests
from firebase_admin import credentials, firestore

TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
TELEGRAM_API = "https://api.telegram.org/bot" + TELEGRAM_TOKEN

# Capital inicial usado pelo calculo de "caixa disponivel" - mesmos valores
# hoje fixos no admin.html (a leitura de configuracoes/financeiro esta
# desativada por la, entao o painel tambem usa sempre 1000 + 1000).
CAPITAL_BR = 1000
CAPITAL_PT = 1000


def inicializar_firebase():
    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    cred = credentials.Certificate(info)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    return firestore.client()


def enviar_mensagem(texto):
    try:
        resposta = requests.post(
            TELEGRAM_API + "/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": texto, "parse_mode": "HTML"},
            timeout=15,
        )
        if not resposta.ok:
            print("Falha ao enviar mensagem: " + resposta.text)
    except Exception as erro:
        print("Erro ao enviar mensagem: " + str(erro))


def calcular_cobranca_parcela(parcela, hoje):
    """Replica calcularCobrancaParcela() do admin.html: multa 5% flat +
    juros de 1% ao dia sobre o valor original, a partir do vencimento."""
    valor_original = float(parcela.get("valor") or 0)
    valor_pago = float(parcela.get("pago") or 0)

    vencimento = parcela.get("vencimento")
    if vencimento is None:
        return {"diasAtraso": 0, "multa": 0, "juros": 0, "totalAtualizado": max(0, valor_original - valor_pago)}

    vencimento_data = vencimento.date() if hasattr(vencimento, "date") else vencimento
    dias_atraso = max(0, (hoje - vencimento_data).days)

    multa = round(valor_original * 0.05, 2) if dias_atraso > 0 else 0
    juros = round(valor_original * 0.01 * dias_atraso, 2) if dias_atraso > 0 else 0
    restante_base = max(0, valor_original - valor_pago)
    total_atualizado = round(restante_base + multa + juros, 2)

    return {"diasAtraso": dias_atraso, "multa": multa, "juros": juros, "totalAtualizado": total_atualizado}


def calcular_aniversario(data_nascimento_str, hoje):
    """Replica o calculo de aniversario do admin.html: string "DD/MM/AAAA"."""
    try:
        dia, mes, ano = [int(p) for p in data_nascimento_str.split("/")]
    except (ValueError, AttributeError):
        return None

    aniversario_este_ano = date(hoje.year, mes, dia)
    if aniversario_este_ano < hoje:
        aniversario_este_ano = date(hoje.year + 1, mes, dia)

    dias_restantes = (aniversario_este_ano - hoje).days
    idade = hoje.year - ano if dias_restantes > 0 else hoje.year - ano

    return {"diasRestantes": dias_restantes, "idade": idade}

def gerar_diagnostico(db):
    hoje = date.today()

    usuarios_snap = list(db.collection("usuarios").stream())
    usuarios_por_id = {doc.id: (doc.to_dict() or {}) for doc in usuarios_snap}

    clientes_total = 0
    clientes_ativos = 0
    isacoin_total_circulacao = 0
    proximos_saques = []
    aniversarios_hoje = []
    aniversarios_7_dias = []
    melhor_cliente = None

    for doc in usuarios_snap:
        user = doc.to_dict() or {}
        clientes_total += 1
        if user.get("status") == "ativo":
            clientes_ativos += 1

        isa_coins = float(user.get("isaCoins") or 0)
        isacoin_total_circulacao += isa_coins

        if isa_coins >= 8000:
            proximos_saques.append(
                {"nome": user.get("nome", "Cliente"), "isaCoins": isa_coins, "faltam": max(0, 10000 - isa_coins)}
            )

        score = float(user.get("score") or 0)
        if melhor_cliente is None or (score, isa_coins) > (melhor_cliente["score"], melhor_cliente["isaCoins"]):
            melhor_cliente = {"nome": user.get("nome", "Cliente"), "score": score, "isaCoins": isa_coins}

        nascimento = user.get("dataNascimento")
        if nascimento:
            aniversario = calcular_aniversario(nascimento, hoje)
            if aniversario is None:
                continue
            if aniversario["diasRestantes"] == 0:
                aniversarios_hoje.append({"nome": user.get("nome", "Cliente"), "idade": aniversario["idade"]})
            elif 0 < aniversario["diasRestantes"] <= 7:
                aniversarios_7_dias.append(
                    {
                        "nome": user.get("nome", "Cliente"),
                        "idade": aniversario["idade"],
                        "diasRestantes": aniversario["diasRestantes"],
                    }
                )

    # ---- Pagamentos em aberto / vencendo (colecao "parcelas") ----
    parcelas_snap = list(db.collection("parcelas").stream())

    abertos_qtd = 0
    abertos_valor = 0.0
    buckets = {"atrasados": [], "hoje": [], "amanha": [], "doisDias": [], "tresDias": []}

    for doc in parcelas_snap:
        parcela = doc.to_dict() or {}
        if parcela.get("status") == "pago":
            continue

        abertos_qtd += 1
        abertos_valor += float(parcela.get("restante") if parcela.get("restante") is not None else parcela.get("valor") or 0)

        vencimento = parcela.get("vencimento")
        if vencimento is None:
            continue
        vencimento_data = vencimento.date() if hasattr(vencimento, "date") else vencimento
        dias = (vencimento_data - hoje).days

        user = usuarios_por_id.get(parcela.get("userId"), {})
        nome = user.get("nome", "Cliente")

        if dias < 0:
            cobranca = calcular_cobranca_parcela(parcela, hoje)
            buckets["atrasados"].append(
                {"nome": nome, "diasAtraso": cobranca["diasAtraso"], "valor": cobranca["totalAtualizado"]}
            )
        elif dias == 0:
            buckets["hoje"].append({"nome": nome, "valor": parcela.get("restante") or parcela.get("valor") or 0})
        elif dias == 1:
            buckets["amanha"].append({"nome": nome, "valor": parcela.get("restante") or parcela.get("valor") or 0})
        elif dias == 2:
            buckets["doisDias"].append({"nome": nome, "valor": parcela.get("restante") or parcela.get("valor") or 0})
        elif dias == 3:
            buckets["tresDias"].append({"nome": nome, "valor": parcela.get("restante") or parcela.get("valor") or 0})

    # ---- Financeiro: dinheiro na rua / caixa disponivel (BR + PT) ----
    # Mesma logica de calcularFinanceiro() no admin.html: "na rua" e o
    # principal emprestado menos o que ja foi recebido de volta; "caixa"
    # e o capital inicial menos o que esta emprestado, mais o que ja voltou.
    emprestimos_snap = list(db.collection("emprestimos").stream())

    total_emprestado = {"BR": 0.0, "PT": 0.0}
    for doc in emprestimos_snap:
        emp = doc.to_dict() or {}
        if emp.get("status") == "ativo":
            pais = emp.get("pais") or "BR"
            total_emprestado[pais] = total_emprestado.get(pais, 0) + float(emp.get("valor") or 0)

    total_recebido = {"BR": 0.0, "PT": 0.0}
    for doc in parcelas_snap:
        parcela = doc.to_dict() or {}
        pais = parcela.get("pais") or "BR"
        total_recebido[pais] = total_recebido.get(pais, 0) + float(parcela.get("pago") or 0)

    dinheiro_na_rua = (total_emprestado["BR"] - total_recebido["BR"]) + (total_emprestado["PT"] - total_recebido["PT"])

    saldo_br = max(0, CAPITAL_BR - total_emprestado["BR"] + total_recebido["BR"])
    saldo_pt = max(0, CAPITAL_PT - total_emprestado["PT"] + total_recebido["PT"])
    caixa_disponivel = saldo_br + saldo_pt

    return {
        "clientesTotal": clientes_total,
        "clientesAtivos": clientes_ativos,
        "isacoinTotalCirculacao": isacoin_total_circulacao,
        "proximosSaques": proximos_saques,
        "aniversariosHoje": aniversarios_hoje,
        "aniversarios7Dias": aniversarios_7_dias,
        "melhorCliente": melhor_cliente,
        "abertosQtd": abertos_qtd,
        "abertosValor": abertos_valor,
        "buckets": buckets,
        "dinheiroNaRua": dinheiro_na_rua,
        "caixaDisponivel": caixa_disponivel,
    }


def formatar_moeda(valor):
    return "R$ " + ("%.2f" % valor)

def montar_mensagem(d):
    hoje_str = date.today().strftime("%d/%m/%Y")
    linhas = ["📊 <b>VivaCred — Resumo do dia " + hoje_str + "</b>", ""]

    linhas.append("💰 <b>Caixa disponível:</b> " + formatar_moeda(d["caixaDisponivel"]))
    linhas.append("🏦 <b>Dinheiro na rua:</b> " + formatar_moeda(d["dinheiroNaRua"]))
    linhas.append("")

    linhas.append(
        "📂 <b>Pagamentos em aberto:</b> "
        + str(d["abertosQtd"])
        + " parcela(s) — "
        + formatar_moeda(d["abertosValor"])
    )
    linhas.append("")

    b = d["buckets"]
    linhas.append("📅 <b>Pagamentos vencendo:</b>")
    if b["atrasados"]:
        total = sum(item["valor"] for item in b["atrasados"])
        linhas.append("🚨 Atrasados: " + str(len(b["atrasados"])) + " — " + formatar_moeda(total))
    if b["hoje"]:
        total = sum(float(item["valor"] or 0) for item in b["hoje"])
        linhas.append("🔴 Hoje: " + str(len(b["hoje"])) + " — " + formatar_moeda(total))
    if b["amanha"]:
        total = sum(float(item["valor"] or 0) for item in b["amanha"])
        linhas.append("🟠 Amanhã: " + str(len(b["amanha"])) + " — " + formatar_moeda(total))
    if b["doisDias"]:
        total = sum(float(item["valor"] or 0) for item in b["doisDias"])
        linhas.append("🟡 Em 2 dias: " + str(len(b["doisDias"])) + " — " + formatar_moeda(total))
    if b["tresDias"]:
        total = sum(float(item["valor"] or 0) for item in b["tresDias"])
        linhas.append("🟢 Em 3 dias: " + str(len(b["tresDias"])) + " — " + formatar_moeda(total))
    if not any([b["atrasados"], b["hoje"], b["amanha"], b["doisDias"], b["tresDias"]]):
        linhas.append("Nada vencendo nos próximos 3 dias. ✅")
    linhas.append("")

    if b["atrasados"]:
        linhas.append("🚨 <b>Clientes em atraso:</b>")
        for item in sorted(b["atrasados"], key=lambda x: -x["diasAtraso"])[:10]:
            linhas.append("• " + item["nome"] + " — " + str(item["diasAtraso"]) + " dia(s) — " + formatar_moeda(item["valor"]))
        linhas.append("")

    if d["aniversariosHoje"]:
        linhas.append("🎂 <b>Aniversário hoje:</b>")
        for a in d["aniversariosHoje"]:
            linhas.append("• " + a["nome"] + " (" + str(a["idade"]) + " anos)")
        linhas.append("")

    if d["aniversarios7Dias"]:
        linhas.append("🎈 <b>Aniversário nos próximos 7 dias:</b>")
        for a in sorted(d["aniversarios7Dias"], key=lambda x: x["diasRestantes"]):
            linhas.append("• " + a["nome"] + " — em " + str(a["diasRestantes"]) + " dia(s) (" + str(a["idade"]) + " anos)")
        linhas.append("")

    if d["proximosSaques"]:
        linhas.append("🪙 <b>Perto dos 10.000 ISAcoins:</b>")
        for c in sorted(d["proximosSaques"], key=lambda x: x["faltam"]):
            linhas.append("• " + c["nome"] + " — " + ("%.0f" % c["isaCoins"]) + " ISC (faltam " + ("%.0f" % c["faltam"]) + ")")
        linhas.append("")

    if d["melhorCliente"]:
        mc = d["melhorCliente"]
        linhas.append(
            "🏆 <b>Melhor cliente (maior nota de crédito):</b> "
            + mc["nome"]
            + " — nota "
            + ("%.0f" % mc["score"])
            + " • "
            + ("%.0f" % mc["isaCoins"])
            + " ISC"
        )
        linhas.append("")

    linhas.append(
        "👥 Clientes: "
        + str(d["clientesTotal"])
        + " total, "
        + str(d["clientesAtivos"])
        + " ativos • 🪙 ISAcoin em circulação: "
        + ("%.0f" % d["isacoinTotalCirculacao"])
    )

    return "\n".join(linhas)


def main():
    db = inicializar_firebase()
    diagnostico = gerar_diagnostico(db)
    mensagem = montar_mensagem(diagnostico)
    print(mensagem)
    enviar_mensagem(mensagem)


if __name__ == "__main__":
    main()
