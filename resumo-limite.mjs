export function textoResumoLimite(p, pais='BR') {
  const moeda=n=>n.toLocaleString('pt-BR',{style:'currency',currency:pais==='PT'?'EUR':'BRL'});
  let motivo=p.perda?'Seu perfil precisa de revisão pelo administrador.':p.atrasosAtuais?
    'Há parcela vencida. Regularize o pagamento para voltar a solicitar.':p.manual?
    'Seu limite foi definido pelo administrador.':p.reducaoPercentual?
    `Seu limite está ${p.reducaoPercentual}% menor por causa do histórico de atrasos.`:'Seu limite está sem redução por atrasos.';
  return {normal:moeda(p.normal),atual:moeda(p.disponivel),motivo,
    nota:p.nota===null?'Ainda não há datas suficientes para calcular sua nota de pagamentos.':`Nota de pagamentos: ${p.nota} de 100.`,
    recuperacao:p.perda?'Entre em contato para revisar seu perfil.':
      'Depois de regularizar os atrasos: cada parcela paga em dia recupera 3 pontos; com pelo menos 5 dias de antecedência, recupera 5 pontos. Pagamentos antecipados em menos de 5 dias recuperam 3 pontos. Máximo: 100 pontos.',
    progresso:p.pontosRecuperados?`Você somou ${p.pontosRecuperados} pontos de recuperação após o último atraso (a nota não passa de 100).`:'',
    faixas:'Nota 75 a 100: sem redução. 60 a 74: redução de 25%. 40 a 59: 50%. 20 a 39: 75%. Abaixo de 20: revisão antes de liberar.',
    incompleto:p.semDataReal||p.semVencimento?'Há registros antigos sem datas suficientes; eles não são considerados pagamentos pontuais comprovados.':''};
}
export function mostrarResumoLimite(el,p,pais){
  el.replaceChildren();
  if(!p){el.textContent='Não foi possível consultar seu limite agora. Atualize a página para tentar novamente.';return;}
  const t=textoResumoLimite(p,pais);
  for(const [label,value] of [['Limite normal',t.normal],['Disponível para solicitar agora',t.atual]]){
    const row=document.createElement('p'),strong=document.createElement('strong');
    row.textContent=label+': ';strong.textContent=value;row.append(strong);el.append(row);
  }
  for(const value of [t.motivo,t.nota,t.progresso,t.incompleto]){if(value){const row=document.createElement('p');row.textContent=value;el.append(row);}}
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Como recuperar meu limite?';details.append(summary);
  for(const value of [t.recuperacao,t.faixas,'A redução vale para novas solicitações. Não muda o valor nem as condições dos empréstimos já contratados. O score do seu nível e a nota de pagamentos são informações diferentes.']){
    const row=document.createElement('p');row.textContent=value;details.append(row);
  }
  el.append(details);
}
