// Demonstrativo administrativo: não grava dados nem altera decisões de crédito.
const dados = item => typeof item?.data === "function" ? item.data() : item;
const teste = item => item?.teste === true || item?.tipoRegistro === "teste";
const numero = valor => Number.isFinite(Number(valor)) ? Math.max(0, Number(valor)) : 0;
const data = valor => {
  if (!valor) return null;
  const resultado = typeof valor.toDate === "function" ? valor.toDate() : new Date(valor);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
};
const dia = valor => Date.UTC(valor.getFullYear(), valor.getMonth(), valor.getDate());
const escapar = valor => String(valor).replace(/[&<>"']/g, caractere => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[caractere]));

export function avaliarCliente(cliente, emprestimos, parcelas, agora = new Date()) {
  const contratos = emprestimos.map(dados).filter(item => !teste(item));
  const itens = parcelas.map(dados).filter(item => !teste(item));
  let concluidas = 0, pontuais = 0, atrasos = 0, atrasosAtuais = 0;
  let semDataReal = 0, semVencimento = 0, maiorAtraso = 0, maiorAtrasoAtual = 0;
  let totalPago = 0, saldoVencido = 0;
  for (const parcela of itens) {
    const valor = numero(parcela.valor), pago = numero(parcela.pago);
    totalPago += pago;
    const quitada = parcela.status === "pago" || (valor > 0 && pago >= valor);
    if (quitada) concluidas++;
    const vencimento = data(parcela.vencimento);
    if (!vencimento) { semVencimento++; continue; }
    if (quitada) {
      // Datas de confirmação pelo admin não comprovam o dia em que o cliente pagou.
      const pagamento = data(parcela.dataPagamentoReal || parcela.dataPagamentoEfetivo);
      if (!pagamento) { semDataReal++; continue; }
      const atraso = Math.max(0, Math.round((dia(pagamento) - dia(vencimento)) / 86400000));
      maiorAtraso = Math.max(maiorAtraso, atraso);
      if (atraso > 3) atrasos++; else pontuais++;
    } else if (parcela.status !== "perdido" && valor > pago) {
      const atraso = Math.max(0, Math.round((dia(agora) - dia(vencimento)) / 86400000));
      if (atraso > 0) {
        atrasosAtuais++;
        maiorAtrasoAtual = Math.max(maiorAtrasoAtual, atraso);
        maiorAtraso = Math.max(maiorAtraso, atraso);
        if (atraso > 3) atrasos++;
        // Saldo original: encargos são apresentados nos cartões financeiros existentes.
        saldoVencido += valor - pago;
      }
    }
  }
  const perdas = contratos.filter(item => item.status === "perdido" || item.perdido === true).length;
  const totalContratado = contratos.filter(item =>
    ["ativo", "perdido"].includes(item.status) || item.finalizado === true
  ).reduce((total, item) => total + numero(item.valor), 0);
  const limiteInformado = cliente?.limiteBase !== undefined && cliente?.limiteBase !== null &&
    cliente?.limiteBase !== "" && Number.isFinite(Number(cliente.limiteBase)) && Number(cliente.limiteBase) >= 0;
  const limiteAtual = limiteInformado ? Number(cliente.limiteBase) : null;
  const evidencias = pontuais + atrasos + atrasosAtuais;
  let nota = null, fator = null;
  const motivos = [];
  if (perdas) {
    nota = 0;
    motivos.push(`${perdas} contrato(s) registrado(s) como perda. Revisar antes de nova liberação.`);
  } else if (evidencias > 0) {
    nota = maiorAtraso > 60 ? 10 : maiorAtraso > 30 ? 28 : maiorAtraso > 10 ? 48 :
      maiorAtraso > 3 ? 68 : maiorAtraso > 0 ? 82 : 95;
    const penalidadeReincidencia = Math.min(15, Math.max(0, atrasos - 1) * 5);
    const penalidadeSemQuitacao = concluidas === 0 && maiorAtraso > 3 ? 10 : 0;
    // Recuperação gradual, sem apagar o atraso: exige três pagamentos comprovados.
    const bonus = Math.min(5, Math.floor(pontuais / 3));
    nota = Math.max(0, Math.min(100, nota - penalidadeReincidencia - penalidadeSemQuitacao + bonus));
    motivos.push(maiorAtraso ? `Maior atraso observado: ${maiorAtraso} dia(s).` : "Pagamentos comprovados sem atraso.");
    if (penalidadeReincidencia) motivos.push(`Reincidência em ${atrasos} parcelas com atraso acima de 3 dias: −${penalidadeReincidencia} pontos.`);
    if (penalidadeSemQuitacao) motivos.push("Ainda não concluiu nenhuma parcela: −10 pontos.");
    if (bonus) motivos.push(`Pagamentos pontuais comprovados: +${bonus} ponto(s).`);
  }
  if (nota !== null) fator = nota >= 75 ? 1 : nota >= 60 ? 0.75 : nota >= 40 ? 0.5 : nota >= 20 ? 0.25 : 0;
  const sugerido = fator !== null && limiteAtual !== null ? Math.floor(limiteAtual * fator * 100) / 100 : null;
  if (atrasosAtuais) motivos.push(`${atrasosAtuais} parcela(s) atualmente vencida(s); avaliar regularização antes de nova liberação.`);
  if (semDataReal) motivos.push(`${semDataReal} pagamento(s) sem data real: não usados para avaliar pontualidade.`);
  if (semVencimento) motivos.push(`${semVencimento} parcela(s) sem vencimento válido: análise incompleta.`);
  if (nota === null) motivos.push("Histórico insuficiente para atribuir nota ou sugerir limite.");
  if (!limiteInformado) motivos.push("Limite efetivo não cadastrado; não foi inferido a partir do score.");
  const faixa = nota === null ? "Histórico insuficiente" : nota >= 90 ? "Bom histórico" : nota >= 75 ? "Acompanhar" :
    nota >= 60 ? "Atenção" : nota >= 40 ? "Atenção elevada" : nota >= 20 ? "Risco elevado" : "Revisão prioritária";
  return { nota, fator, sugerido, limiteAtual, faixa, motivos, concluidas, pontuais, atrasos,
    atrasosAtuais, maiorAtraso, maiorAtrasoAtual, semDataReal, semVencimento, totalContratado,
    totalPago, saldoVencido, perdas, pais: cliente?.pais || "BR" };
}

export function criarIndiceAvaliacoes(usuarios, emprestimos, parcelas, agora = new Date()) {
  const porId = new Map(), porEmail = new Map(), idsPorEmail = new Map();
  const usuariosDados = usuarios.map(item => ({ ...dados(item), id: item.id }));
  for (const usuario of usuariosDados) {
    if (usuario.email) {
      const ids = idsPorEmail.get(usuario.email) || [];
      ids.push(usuario.id); idsPorEmail.set(usuario.email, ids);
    }
  }
  const contratosPorUsuario = new Map(), parcelasPorContrato = new Map();
  for (const item of parcelas) {
    const parcela = dados(item);
    const lista = parcelasPorContrato.get(parcela.emprestimoId) || [];
    lista.push(parcela); parcelasPorContrato.set(parcela.emprestimoId, lista);
  }
  for (const item of emprestimos) {
    const contrato = dados(item);
    if (teste(contrato)) continue;
    // O ID tem prioridade; e-mail é compatibilidade apenas para registros antigos sem ID.
    const ids = idsPorEmail.get(contrato.email) || [];
    const userId = contrato.userId || (ids.length === 1 ? ids[0] : null);
    if (!userId) continue;
    const lista = contratosPorUsuario.get(userId) || [];
    lista.push({ ...contrato, id: item.id }); contratosPorUsuario.set(userId, lista);
  }
  for (const usuario of usuariosDados) {
    const contratos = contratosPorUsuario.get(usuario.id) || [];
    const itens = contratos.flatMap(item => parcelasPorContrato.get(item.id) || []);
    const avaliacao = avaliarCliente(usuario, contratos, itens, agora);
    porId.set(usuario.id, avaliacao);
    if ((idsPorEmail.get(usuario.email) || []).length === 1) porEmail.set(usuario.email, avaliacao);
  }
  return { porId, porEmail };
}

export function avaliacaoHTML(avaliacao) {
  if (!avaliacao) return '<aside class="avaliacao-interna">Avaliação interna indisponível: cliente não identificado.</aside>';
  const a = avaliacao;
  const moeda = valor => valor === null ? "Não disponível" : valor.toLocaleString("pt-BR", {
    style: "currency", currency: a.pais === "PT" ? "EUR" : "BRL"
  });
  return `<aside class="avaliacao-interna" aria-label="Avaliação interna do cliente">
    <strong>Avaliação interna · ${a.faixa}</strong>
    <div class="avaliacao-metricas"><span>Nota interna <b>${a.nota === null ? "Sem nota" : a.nota + "/100"}</b></span>
    <span>Limite atual <b>${moeda(a.limiteAtual)}</b></span>
    <span>Sugestão para análise <b>${a.fator === 0 ? "Revisar antes de liberar" : moeda(a.sugerido)}</b></span></div>
    <small>Demonstrativo exclusivo do admin. Não altera limite, score, aprovação ou bloqueio.</small>
    <details><summary>Ver motivos, histórico e critérios</summary>
      <p>Contratado: ${moeda(a.totalContratado)} · Pago em parcelas (inclui encargos recebidos): ${moeda(a.totalPago)}.<br>
      Parcelas concluídas: ${a.concluidas} · Pontuais comprovadas (até 3 dias): ${a.pontuais}.<br>
      Maior atraso atual: ${a.maiorAtrasoAtual} dia(s) · Saldo original vencido: ${moeda(a.saldoVencido)}.</p>
      <ul>${a.motivos.map(motivo => `<li>${escapar(motivo)}</li>`).join("")}</ul>
      <p>Critérios v1: sem atraso 95 pontos; 1–3 dias 82; 4–10 dias 68; 11–30 dias 48;
      31–60 dias 28; mais de 60 dias 10; perda registrada 0. Cada reincidência acima de 3 dias
      desconta 5 pontos (até 15). Sem parcela concluída e atraso acima de 3 dias: −10.
      A cada 3 parcelas pontuais comprovadas: +1 (até 5). Perdas mantêm nota 0.
      Nota 75–100: sugerir 100% do limite atual; 60–74: 75%; 40–59: 50%; 20–39: 25%;
      0–19: revisar antes de liberar. Não sugere aumento. Usa todo o histórico real disponível;
      sem evidência, não atribui nota. Atualizado ao carregar os dados do painel.</p>
    </details>
  </aside>`;
}
