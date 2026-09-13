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

# Novo Caixa começa com o saldo real confirmado pelo proprietário. A partir
# deste marco, aportes, novos empréstimos e pagamentos geram movimentações.
SALDO_INICIAL_CAIXA_BR = 331
SALDO_INICIAL_CAIXA_PT = 0

# Quantos dias pra frente mostrar na lista de "vencendo" (a pedido do
# usuario: quer ver todos os que vencem de hoje ate 7 dias a frente).
DIAS_JANELA_VENCIMENTO = 7

# Premio anual concedido automaticamente no dia do aniversario. O ano
# processado fica salvo no documento do usuario para impedir premio duplicado
# caso a rotina seja executada novamente no mesmo dia.
BONUS_ANIVERSARIO_ISACOIN = 5000


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


def aniversario_e_hoje(data_nascimento_str, hoje):
    """Confere apenas dia e mes da data salva como DD/MM/AAAA."""
    try:
        dia, mes, _ = [int(p) for p in data_nascimento_str.split("/")]
    except (ValueError, AttributeError):
        return False
    return dia == hoje.day and mes == hoje.month


@firestore.transactional
def registrar_bonus_aniversario(transaction, usuario_ref, hoje, cliente_em_atraso):
    """Registra uma unica decisao por ano e credita o premio quando permitido."""
    usuario_snap = usuario_ref.get(transaction=transaction)
    if not usuario_snap.exists:
        return "ignorado"

    usuario = usuario_snap.to_dict() or {}
    if not aniversario_e_hoje(usuario.get("dataNascimento"), hoje):
        return "ignorado"

    if str(usuario.get("bonusAniversarioProcessadoAno") or "") == str(hoje.year):
        return "ja_processado"

    dados_processamento = {
        "bonusAniversarioProcessadoAno": hoje.year,
        "bonusAniversarioProcessadoEm": firestore.SERVER_TIMESTAMP,
    }

    if cliente_em_atraso:
        dados_processamento.update(
            {
                "bonusAniversarioStatus": "negado_atraso",
                "bonusAniversarioMotivo": "parcela_atrasada",
            }
        )
        transaction.update(usuario_ref, dados_processamento)
        return "negado_atraso"

    dados_processamento.update(
        {
            "isaCoins": firestore.Increment(BONUS_ANIVERSARIO_ISACOIN),
            "isaCoinsRecebidas": firestore.Increment(BONUS_ANIVERSARIO_ISACOIN),
            "bonusAniversarioStatus": "concedido",
            "bonusAniversarioMotivo": None,
        }
    )
    transaction.update(usuario_ref, dados_processamento)
    return "concedido"


def processar_bonus_aniversario(db):
    """Concede ou nega o premio dos aniversariantes antes do resumo diario."""
    hoje = date.today()
    usuarios_em_atraso = set()

    for parcela_doc in db.collection("parcelas").stream():
        parcela = parcela_doc.to_dict() or {}
        if parcela_encerrada(parcela):
            continue

        vencimento = parcela.get("vencimento")
        user_id = parcela.get("userId")
        if vencimento is None or not user_id:
            continue

        vencimento_data = vencimento.date() if hasattr(vencimento, "date") else vencimento
        if vencimento_data < hoje:
            usuarios_em_atraso.add(user_id)

    resultado = {"concedidos": 0, "negados": 0, "jaProcessados": 0}
    for usuario_doc in db.collection("usuarios").stream():
        usuario = usuario_doc.to_dict() or {}
        if not aniversario_e_hoje(usuario.get("dataNascimento"), hoje):
            continue

        transaction = db.transaction()
        status = registrar_bonus_aniversario(
            transaction,
            usuario_doc.reference,
            hoje,
            usuario_doc.id in usuarios_em_atraso,
        )
        if status == "concedido":
            resultado["concedidos"] += 1
        elif status == "negado_atraso":
            resultado["negados"] += 1
        elif status == "ja_processado":
            resultado["jaProcessados"] += 1

    return resultado


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


def registro_teste(dados):
    """Registros de teste ficam salvos, mas não entram em nenhum resumo financeiro."""
    return dados.get("tipoRegistro") == "teste" or dados.get("teste") is True


def parcela_encerrada(dados):
    """Parcelas pagas ou assumidas como perda não geram cobrança nem saldo."""
    return dados.get("status") in {"pago", "perdido"}

def gerar_diagnostico(db):
    hoje = date.today()

    usuarios_snap = list(db.collection("usuarios").stream())
    usuarios_por_id = {doc.id: (doc.to_dict() or {}) for doc in usuarios_snap}

    emprestimos_snap = list(db.collection("emprestimos").stream())
    emprestimos_por_id = {doc.id: (doc.to_dict() or {}) for doc in emprestimos_snap}
    emprestimos_teste_ids = {
        emprestimo_id
        for emprestimo_id, emprestimo in emprestimos_por_id.items()
        if registro_teste(emprestimo)
    }

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
                aniversarios_hoje.append(
                    {
                        "nome": user.get("nome", "Cliente"),
                        "idade": aniversario["idade"],
                        "bonusStatus": user.get("bonusAniversarioStatus")
                        if str(user.get("bonusAniversarioProcessadoAno") or "") == str(hoje.year)
                        else None,
                    }
                )
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
        if registro_teste(parcela) or parcela.get("emprestimoId") in emprestimos_teste_ids:
            continue
        if parcela_encerrada(parcela):
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

    # ---- Financeiro: cada indicador tem uma função diferente. ----
    # "Na rua" é somente o principal ainda não recuperado. "A receber" é
    # a soma contratual das parcelas restantes. O Caixa vem exclusivamente
    # do saldo inicial mais as movimentações registradas a partir deste marco.
    dinheiro_na_rua = {"BR": 0.0, "PT": 0.0}
    total_a_receber = {"BR": 0.0, "PT": 0.0}

    for doc in parcelas_snap:
        parcela = doc.to_dict() or {}
        emprestimo_id = parcela.get("emprestimoId")
        emprestimo = emprestimos_por_id.get(emprestimo_id, {})

        if registro_teste(parcela) or emprestimo_id in emprestimos_teste_ids:
            continue
        if parcela_encerrada(parcela):
            continue

        pais = emprestimo.get("pais") or parcela.get("pais") or "BR"
        pago = float(parcela.get("pago") or 0)
        restante = max(0, float(parcela.get("restante") if parcela.get("restante") is not None else float(parcela.get("valor") or 0) - pago))
        if emprestimo.get("status") != "ativo":
            continue

        total_a_receber[pais] = total_a_receber.get(pais, 0) + restante

        principal = float(emprestimo.get("valor") or 0)
        total_contrato = float(emprestimo.get("valorFinal") or principal or 0)
        proporcao_padrao = min(1, principal / total_contrato) if total_contrato > 0 else 1

        if parcela.get("acordoAtivo") is True:
            principal_acordo = float(parcela.get("principalPendenteAcordo") if parcela.get("principalPendenteAcordo") is not None else float(parcela.get("valor") or 0) * proporcao_padrao)
            pago_depois = max(0, pago - float(parcela.get("pagoAntesAcordo") or 0))
            proporcao = float(parcela.get("proporcaoPrincipalAcordo") if parcela.get("proporcaoPrincipalAcordo") is not None else proporcao_padrao)
            principal_pendente = max(0, principal_acordo - pago_depois * proporcao)
        else:
            principal_pendente = max(0, (float(parcela.get("valor") or 0) - pago) * proporcao_padrao)

        dinheiro_na_rua[pais] = dinheiro_na_rua.get(pais, 0) + principal_pendente

    config_snap = db.collection("configuracoes").document("financeiro").get()
    config = config_snap.to_dict() or {} if config_snap.exists else {}
    saldo_caixa = {
        "BR": float(config.get("saldoInicialBR") if config.get("saldoInicialBR") is not None else SALDO_INICIAL_CAIXA_BR) + float(config.get("impactoCaixaBR") or 0),
        "PT": float(config.get("saldoInicialPT") if config.get("saldoInicialPT") is not None else SALDO_INICIAL_CAIXA_PT) + float(config.get("impactoCaixaPT") or 0),
    }
    aportes = {
        "BR": float(config.get("aportesBR") or 0),
        "PT": float(config.get("aportesPT") or 0),
    }
    repasse_evelyn = {
        "BR": float(config.get("repasseEvelynBR") or 0),
        "PT": float(config.get("repasseEvelynPT") or 0),
    }
    lucro_liquido = {
        "BR": float(config.get("lucroLiquidoBR") or 0),
        "PT": float(config.get("lucroLiquidoPT") or 0),
    }

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
        "totalAReceber": total_a_receber,
        "caixaDisponivel": saldo_caixa,
        "aportes": aportes,
        "repasseEvelyn": repasse_evelyn,
        "lucroLiquido": lucro_liquido,
    }


def formatar_moeda(valor):
    return "R$ " + ("%.2f" % valor)

def montar_mensagem(d):
    hoje_str = date.today().strftime("%d/%m/%Y")
    linhas = ["📊 <b>VivaCred — Resumo do dia " + hoje_str + "</b>", ""]

    linhas.append("💰 <b>Caixa disponível:</b> " + formatar_moeda(d["caixaDisponivel"]["BR"]) + " | € " + ("%.2f" % d["caixaDisponivel"]["PT"]))
    linhas.append("🏦 <b>Dinheiro na rua:</b> " + formatar_moeda(d["dinheiroNaRua"]["BR"]) + " | € " + ("%.2f" % d["dinheiroNaRua"]["PT"]))
    linhas.append("💳 <b>Total a receber:</b> " + formatar_moeda(d["totalAReceber"]["BR"]) + " | € " + ("%.2f" % d["totalAReceber"]["PT"]))
    linhas.append("🤝 <b>Evelyn (10%):</b> " + formatar_moeda(d["repasseEvelyn"]["BR"]) + " | € " + ("%.2f" % d["repasseEvelyn"]["PT"]))
    linhas.append("📈 <b>Lucro líquido recebido:</b> " + formatar_moeda(d["lucroLiquido"]["BR"]) + " | € " + ("%.2f" % d["lucroLiquido"]["PT"]))
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
            premio = ""
            if a.get("bonusStatus") == "concedido":
                premio = " — +5.000 ISC concedidos ✅"
            elif a.get("bonusStatus") == "negado_atraso":
                premio = " — sem prêmio: cliente em atraso 🚫"
            linhas.append("• " + a["nome"] + " (" + str(a["idade"]) + " anos)" + premio)
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
    resultado_bonus = processar_bonus_aniversario(db)
    print("Bonus de aniversario: " + json.dumps(resultado_bonus, ensure_ascii=False))
    diagnostico = gerar_diagnostico(db)
    mensagem = montar_mensagem(diagnostico)
    print(mensagem)
    enviar_mensagem(mensagem)


if __name__ == "__main__":
    main()
