"""Cartões administrativos; nenhuma mensagem é enviada diretamente a clientes."""
from datetime import date, datetime
from zoneinfo import ZoneInfo
from html import escape


def moeda(v, pais="BR"):
    n = f"{float(v):,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return ("€ " if pais == "PT" else "R$ ") + n


def promessa_atual(avisos, parcela_id, user_id, hoje):
    candidatas = []
    for chave in ("parcela-" + str(parcela_id), "cliente-" + str(user_id)):
        aviso = avisos.get(chave, {})
        if aviso.get("status") != "ativa":
            continue
        try:
            dia = date.fromisoformat(aviso.get("data", ""))
        except (ValueError, TypeError):
            return {**aviso, "invalida": True}
        if dia >= hoje:
            candidatas.append(aviso)
    return max(candidatas, key=lambda a: a["data"]) if candidatas else None


def montar_relatorio(d, previa=False):
    agora = datetime.now(ZoneInfo("America/Sao_Paulo"))
    esc = lambda v: escape(str(v))
    dupla = lambda v: moeda(v.get("BR", 0)) + " | " + moeda(v.get("PT", 0), "PT")
    cobraveis = [a for a in d["atrasados"] if not a.get("promessa")]
    acordados = [a for a in d["atrasados"] if a.get("promessa")]
    titulo = "🧪 PRÉVIA • " if previa else ""
    mensagens = [
        f"{titulo}📊 <b>CENTRAL DIÁRIA ISACRED</b>\n{agora:%d/%m/%Y às %H:%M} • horário de Brasília\n"
        "━━━━━━━━━━━━━━━\n"
        f"🎯 <b>MISSÕES PARA SUA ANÁLISE</b>\n"
        f"📨 {len(cobraveis)} parcela(s) com texto de cobrança disponível\n"
        f"🤝 {len(acordados)} parcela(s) aguardando promessa — sem cobrança\n"
        f"📥 {len(d.get('pedidosPendentes', []))} pedido(s) de empréstimo pendente(s)\n"
        f"🪙 {len(d.get('saquesPendentes', []))} saque(s) solicitado(s) pendente(s)\n\n"
        "💰 <b>PLACAR FINANCEIRO</b>\n"
        f"Caixa: {dupla(d['caixaDisponivel'])}\n"
        f"Capital na rua: {dupla(d['dinheiroNaRua'])}\n"
        f"A receber contratual: {dupla(d['totalAReceber'])}\n"
        f"Aportes acumulados: {dupla(d['aportes'])}\n"
        f"Lucro líquido recebido: {dupla(d['lucroLiquido'])}\n"
        f"Reservado à Evelyn: {dupla(d['repasseEvelyn'])}\n\n"
        f"👥 {d['clientesTotal']} clientes • {d['clientesAtivos']} ativos • {d.get('clientesBloqueados', 0)} bloqueados\n"
        f"🪙 ISAcoin em circulação: {d['isacoinTotalCirculacao']:,.0f} ISC\n\n"
        "Valores são registros atuais. Previsões não são recebimentos confirmados."
    ]
    entradas = d["vencendo"]
    totais = {p: sum(a['valor'] for a in entradas if a.get('pais', 'BR') == p) for p in ('BR', 'PT')}
    mensagens.append("📅 <b>RADAR • ENTRADAS NOS PRÓXIMOS 7 DIAS</b>\n"
                     + dupla(totais) + f"\n{len(entradas)} parcela(s) prevista(s).\nPromessas de parcelas atrasadas aparecem em cartão separado.")
    for a in sorted(entradas, key=lambda a: a['diasRestantes']):
        dias = a['diasRestantes']
        quando = 'Hoje' if dias == 0 else 'Amanhã' if dias == 1 else f'Em {dias} dias'
        mensagens.append(f"📅 <b>{quando}</b>\n👤 {esc(a['nome'])}\n📄 Parcela {esc(a['parcela'])}\n💰 {moeda(a['valor'], a.get('pais', 'BR'))}")
    totais_atraso = {p: sum(a['valor'] for a in d['atrasados'] if a.get('pais', 'BR') == p) for p in ('BR', 'PT')}
    mensagens.append(f"🚨 <b>CARTEIRA EM ATRASO</b>\n{len(d['atrasados'])} parcela(s) • {dupla(totais_atraso)}\n"
                     f"🤝 {len(acordados)} com promessa vigente ou pendente de conferência.\n"
                     "Os juros continuam correndo, salvo acordo sem encargos registrado.")
    for a in sorted(d['atrasados'], key=lambda a: -a['diasAtraso']):
        pais = a.get('pais', 'BR')
        detalhe = (f"👤 <b>{esc(a['nome'])}</b>\n📞 {esc(a.get('telefone', 'Não informado'))}\n"
                   f"📄 Parcela {esc(a['parcela'])} • venceu {esc(a.get('vencimento', ''))}\n"
                   f"⏳ {a['diasAtraso']} dia(s) de atraso\n"
                   f"Valor original: {moeda(a.get('original', 0), pais)}\n"
                   f"Multa: {moeda(a.get('multa', 0), pais)} • Juros: {moeda(a.get('juros', 0), pais)}\n"
                   f"📌 Total para hoje: {moeda(a['valor'], pais)}")
        aviso = a.get('promessa')
        if aviso:
            if aviso.get('invalida'):
                mensagens.append("🛑 <b>CONFERIR PROMESSA — SEM COBRANÇA</b>\n" + detalhe + "\nData inválida no aviso: confira no administrador.")
            else:
                data = date.fromisoformat(aviso['data']).strftime('%d/%m/%Y')
                estimativa = a.get('estimativaPromessa') or {}
                mensagens.append("🤝 <b>AGUARDANDO PAGAMENTO COMBINADO</b>\n" + detalhe
                    + f"\n📅 Promessa: {data} — aguardar até o fim desse dia."
                    + f"\n💰 Estimativa na data: {moeda(estimativa.get('totalAtualizado', a['valor']), pais)}"
                    + f"\nJuros na data: {moeda(estimativa.get('juros', 0), pais)}"
                    + "\n🔕 Texto de cobrança suspenso para esta parcela.")
            continue
        mensagens.append("🎯 <b>MISSÃO • CONTATO DISPONÍVEL</b>\n" + detalhe + "\nO próximo cartão contém somente a mensagem para copiar. Nenhum envio ao cliente foi realizado.")
        texto = (f"Olá, {a['nome']}. Aqui é da IsaCred. A parcela {a['parcela']}, vencida em {a.get('vencimento', '')}, "
                 f"continua em aberto. Para pagamento hoje, {agora:%d/%m/%Y}, o total atualizado é "
                 f"{moeda(a['valor'], pais)}, incluindo multa de {moeda(a.get('multa', 0), pais)} "
                 f"e juros de {moeda(a.get('juros', 0), pais)}. Pode me informar quando conseguirá realizar o pagamento? Obrigado.")
        mensagens.append('<pre>' + esc(texto) + '</pre>')
    mensagens.append("🪙 <b>RADAR ISAcoin</b>\n" +
        ("\n".join(f"• {esc(a['nome'])}: {a['isaCoins']:.0f} ISC • faltam {a['faltam']:.0f} para 10.000" for a in d['proximosSaques']) or "Nenhum cliente próximo de 10.000 ISC.")
        + "\nEssa lista não representa solicitações de saque.")
    for campo, titulo in [('aniversariosHoje', '🎂 ANIVERSÁRIOS HOJE'), ('aniversarios7Dias', '🎈 ANIVERSÁRIOS NOS PRÓXIMOS 7 DIAS')]:
        mensagens.append(f"<b>{titulo}</b>\n" + ('\n'.join(f"• {esc(a['nome'])} • {a['idade']} anos" + (f" • em {a['diasRestantes']} dias" if 'diasRestantes' in a else '') for a in d[campo]) or 'Nenhum registrado para o período.'))
    mensagens.append("✅ <b>RELATÓRIO CONCLUÍDO</b>\nDados consultados no sistema. Nenhuma cobrança foi enviada aos clientes.\n"
                    "Conquistas, progresso de recebimentos e mudanças desde ontem serão exibidos somente quando houver comparação de histórico validada.\n"
                    '<a href="https://overlookalpha.github.io/vivacred/admin.html">Abrir administrador</a>')
    # Cada cartão permanece íntegro: não quebrar HTML ao meio.
    for m in mensagens:
        if len(m) > 3800:
            raise ValueError("Cartão excede o tamanho seguro; reduzir os detalhes antes de enviar")
    return [f"{i}/{len(mensagens)}\n" + m for i, m in enumerate(mensagens, 1)]
