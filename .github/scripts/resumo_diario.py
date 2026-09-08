"""
Script do resumo diario do VivaCred, enviado no Telegram do admin.

Roda uma vez por dia via GitHub Actions (ver
.github/workflows/resumo-diario.yml), 100% na nuvem - nao depende do
computador de ninguem estar ligado.

Junta num unico resumo diario: pagamentos em aberto, pagamentos vencendo
nos proximos 7 dias (um a um, com nome, valor, parcela e aviso de
antecedencia que o cliente pediu), atrasados, aniversariantes de hoje e
dos proximos 7 dias, clientes perto de bater 10.000 ISAcoins, dinheiro na
rua, dinheiro em caixa e o melhor cliente (maior nota de credito).

A logica de calculo (aniversario, multa/juros de atraso, dinheiro na rua,
caixa disponivel, numero da parcela, aviso de antecedencia) replica
exatamente a mesma logica ja usada no admin.html do VivaCred, pra os
numeros baterem com o painel.
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

# Quantos dias pra frente mostrar na lista de "vencendo" (a pedido do
# usuario: quer ver todos os que vencem de hoje ate 7 dias a frente).
DIAS_JANELA_VENCIMENTO = 7


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


def formatar_parcela(numero, total):
    """Replica o "${parcela.numero} de ${emprestimo.parcelas}" do admin.html."""
    if not numero:
        return "-"
    try:
        texto = str(int(numero))
    except (ValueError, TypeError):
        texto = str(numero)
    if total:
        try:
            texto += " de " + str(int(total))
        except (ValueError, TypeError):
            texto += " de " + str(total)
    return texto

def gerar_diagnostico(db):
    hoje = date.today()

    usuarios_snap = list(db.collection("usuarios").stream())
    usuarios_por_id = {doc.id: (doc.to_dict() or {}) for doc in usuarios_snap}

    emprestimos_snap = list(db.collection("emprestimos").stream())
    emprestimos_por_id = {doc.id: (doc.to_dict() or {}) for doc in emprestimos_snap}

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

    # ---- Pagamentos em aberto / vencendo / atrasados (colecao "parcelas") ----
    parcelas_snap = list(db.collection("parcelas").stream())

    abertos_qtd = 0
    abertos_valor = 0.0
    atrasados = []
    vencendo = []

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

        # Preferencia de aviso que o proprio cliente escolheu (1, 3 ou 7
        # dias de antecedencia) - mesmo campo "diasLembrete" do admin.html,
        # com o mesmo padrao de 3 dias quando ele nunca escolheu.
        dias_aviso = int(user.get("diasLembrete") or 3)

        emprestimo = emprestimos_por_id.get(parcela.get("emprestimoId"), {})
        parcela_label = formatar_parcela(parcela.get("numero"), emprestimo.get("parcelas"))
        valor_parcela = float(parcela.get("restante") if parcela.get("restante") is not None else parcela.get("valor") or 0)

        if dias < 0:
            cobranca = calcular_cobranca_parcela(parcela, hoje)
            atrasados.append(
                {
                    "nome": nome,
                    "parcela": parcela_label,
                    "diasAtraso": cobranca["diasAtraso"],
                    "valor": cobranca["totalAtualizado"],
                    "diasAviso": dias_aviso,
                }
            )
        elif 0 <= dias <= DIAS_JANELA_VENCIMENTO:
            vencendo.append(
                {
                    "nome": nome,
                    "parcela": parcela_label,
                    "valor": valor_parcela,
                    "diasRestantes": dias,
                    "diasAviso": dias_aviso,
                }
            )

    # ---- Financeiro: dinheiro na rua / caixa disponivel (BR + PT) ----
    # Mesma logica de calcularFinanceiro() no admin.html: "na rua" e o
    # principal emprestado menos o que ja foi recebido de volta; "caixa"
    # e o capital inicial menos o que esta emprestado, mais o que ja voltou.
    total_emprestado = {"BR": 0.0, "PT": 0.0}
    for emp in emprestimos_por_id.values():
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
        "atrasados": atrasados,
        "vencendo": vencendo,
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

    atrasados = d["atrasados"]
    if atrasados:
        total_atrasado = sum(item["valor"] for item in atrasados)
        linhas.append("🚨 <b>Atrasados</b> (" + str(len(atrasados)) + ") — " + formatar_moeda(total_atrasado))
        for item in sorted(atrasados, key=lambda x: -x["diasAtraso"]):
            linhas.append(
                "• "
                + item["nome"]
                + " — parcela "
                + item["parcela"]
                + " — "
                + formatar_moeda(item["valor"])
                + " — "
                + str(item["diasAtraso"])
                + " dia(s) de atraso"
                + " — 🔔 aviso pedido: "
                + str(item["diasAviso"])
                + (" dia" if item["diasAviso"] == 1 else " dias")
                + " de antecedência"
            )
        linhas.append("")

    vencendo = d["vencendo"]
    linhas.append("📅 <b>Vencendo nos próximos " + str(DIAS_JANELA_VENCIMENTO) + " dias:</b>")
    if vencendo:
        for dias in range(0, DIAS_JANELA_VENCIMENTO + 1):
            itens_dia = [item for item in vencendo if item["diasRestantes"] == dias]
            if not itens_dia:
                continue
            if dias == 0:
                rotulo = "Hoje"
            elif dias == 1:
                rotulo = "Amanhã"
            else:
                rotulo = "Em " + str(dias) + " dias"
            total_dia = sum(item["valor"] for item in itens_dia)
            linhas.append("")
            linhas.append("🔸 <b>" + rotulo + "</b> (" + str(len(itens_dia)) + ") — " + formatar_moeda(total_dia))
            for item in itens_dia:
                linhas.append(
                    "• "
                    + item["nome"]
                    + " — parcela "
                    + item["parcela"]
                    + " — "
                    + formatar_moeda(item["valor"])
                    + " — 🔔 cliente pediu aviso com "
                    + str(item["diasAviso"])
                    + (" dia" if item["diasAviso"] == 1 else " dias")
                    + " de antecedência"
                )
    else:
        linhas.append("Nada vencendo nos próximos " + str(DIAS_JANELA_VENCIMENTO) + " dias. ✅")
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
