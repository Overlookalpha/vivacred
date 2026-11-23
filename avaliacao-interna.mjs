// Resumo administrativo da regra aplicada pelo servidor; não grava dados.
import { limiteEfetivo } from "./perfil-credito.mjs";
import { limitesRecuperacao } from "./functions/lib/recuperacaoCredito.mjs";
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
      if (atraso > 3) atrasos++;
      if (atraso === 0) pontuais++;
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
  const limiteInformado = cliente?.score !== undefined && cliente?.score !== null &&
    cliente?.score !== "" && Number.isFinite(Number(cliente.score));
  const limiteAtual = limiteInformado ? limiteEfetivo(cliente) : null;
  const recuperacao = limitesRecuperacao(cliente || {}, limiteAtual || 0, contratos, itens, agora);
  const {nota, fator} = recuperacao;
  const sugerido = limiteAtual === null || nota === null ? null : recuperacao.limiteAvaliado;
  const motivos = [
    `Maior atraso observado: ${recuperacao.maiorAtraso} dia(s); soma por parcela: ${recuperacao.diasAcumulados} dia(s).`,
    `Recuperação: ${recuperacao.pontuaisRecuperacao} pagamento(s) de +3 e ${recuperacao.antecipadasRecuperacao} de +5 após o último atraso.`
  ];
  if(recuperacao.atrasosAtuais) motivos.push('Existem parcelas vencidas: novas solicitações suspensas até regularização.');
  if(recuperacao.perda) motivos.push('Perda registrada: revisão obrigatória pelo administrador.');
  if(recuperacao.manual) motivos.push('Limite manual preservado; não sofre redução automática pela nota.');
  if(recuperacao.semDataReal) motivos.push(`${recuperacao.semDataReal} pagamento(s) sem data real válida: pontualidade não comprovada.`);
  if(recuperacao.semVencimento) motivos.push(`${recuperacao.semVencimento} parcela(s) sem vencimento válido.`);
  if(nota === null) motivos.push('Histórico insuficiente para atribuir nota.');
  const faixa = nota === null ? "Histórico insuficiente" : nota >= 90 ? "Bom histórico" : nota >= 75 ? "Acompanhar" :
    nota >= 60 ? "Atenção" : nota >= 40 ? "Atenção elevada" : nota >= 20 ? "Risco elevado" : "Revisão prioritária";
  return { nota, fator, sugerido, limiteAtual, disponivel:recuperacao.disponivel, recuperacao, faixa, motivos, concluidas, pontuais, atrasos,
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
    <span>Limite na área do usuário <b>${moeda(a.limiteAtual)}</b></span>
    <span>Limite após avaliação <b>${a.fator === 0 ? "Revisar antes de liberar" : moeda(a.sugerido)}</b></span></div>
    <small>Nota de pagamentos aplicada às novas solicitações pelo servidor. Limites manuais preservados. Não altera contratos existentes.</small>
    <details><summary>Ver motivos, histórico e critérios</summary>
      <p>Contratado: ${moeda(a.totalContratado)} · Pago em parcelas (inclui encargos recebidos): ${moeda(a.totalPago)}.<br>
      Parcelas concluídas: ${a.concluidas} · Pontuais comprovadas (sem atraso): ${a.pontuais}.<br>
      Maior atraso atual: ${a.maiorAtrasoAtual} dia(s) · Saldo original vencido: ${moeda(a.saldoVencido)}.</p>
      <ul>${a.motivos.map(motivo => `<li>${escapar(motivo)}</li>`).join("")}</ul>
      <p>Nota-base: sem atraso 95; 1–3 dias 82; 4–10 dias 68; 11–30 dias 48;
      31–60 dias 28; mais de 60 dias 10; perda 0. Reincidência acima de 3 dias: −5 (até −15).
      Sem parcela concluída e atraso acima de 3 dias: −10.
      Depois do último atraso regularizado: pagamento em dia ou antecipado menos de 5 dias +3;
      antecipado pelo menos 5 dias +5. Máximo 100. Sem bônus em pagamento atrasado.
      Nota 75–100: 100% do limite normal; 60–74: 75%; 40–59: 50%; 20–39: 25%; abaixo de 20: revisão.
      Parcela vencida suspende novas solicitações; promessa não muda vencimento nem nota.
      Disponível agora: ${moeda(a.disponivel)}. Pagamentos sem data real não comprovam pontualidade.</p>
    </details>
  </aside>`;
}
