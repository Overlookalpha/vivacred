const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function detalhesExtrato(p,formatar){
 const linhas=[];
 const data=v=>{const d=v?.toDate?.()||(v?new Date(v):null);return d&&!Number.isNaN(d.getTime())?d.toLocaleDateString('pt-BR'):null;};
 const dinheiro=v=>esc(formatar(Number(v||0)));
 const real=data(p.dataPagamentoReal);
 const registro=data(p.pagoEm||p.dataPagamento||p.ultimaDataPagamento);
 if(real)linhas.push('📅 Pagamento realizado em '+real);
 else if(registro)linhas.push('📅 Último registro de pagamento: '+registro);
 if(p.acordoAtivo===true||p.valorAcordado!=null){
  linhas.push('🤝 Acordo registrado'+(data(p.acordoCriadoEm)?' em '+data(p.acordoCriadoEm):''));
  if(p.valorAntesAcordo!=null)linhas.push('Valor da parcela antes do acordo: '+dinheiro(p.valorAntesAcordo));
  if(p.restanteAntesAcordo!=null)linhas.push('Saldo antes do acordo: '+dinheiro(p.restanteAntesAcordo));
  if(p.valorAcordado!=null)linhas.push('Saldo combinado no acordo: '+dinheiro(p.valorAcordado));
  if(p.pagoAntesAcordo!=null&&Number(p.pagoAntesAcordo)>0)linhas.push('Pago antes do acordo: '+dinheiro(p.pagoAntesAcordo));
 }
 if(p.acordoSemEncargos===true)linhas.push('🤝 Acordo sem multa e juros'+(data(p.acordoSemEncargosEm)?' registrado em '+data(p.acordoSemEncargosEm):''));
 if(p.perfilPagamento==='atrasado'||Number(p.diasDiferenca)>0)linhas.push('⏳ Pagamento em atraso'+(Number(p.diasDiferenca)>0?': '+Number(p.diasDiferenca)+' dia(s)':''));
 // Campos de encargos não são prova de recebimento; não somá-los novamente ao pago.
 if(p.jurosPagos!=null)linhas.push('Juros pagos registrados: '+dinheiro(p.jurosPagos));
 else if(Number(p.juros)>0)linhas.push('Juros registrados na parcela: '+dinheiro(p.juros)+' (recebimento não discriminado)');
 if(p.multaPaga!=null)linhas.push('Multa paga registrada: '+dinheiro(p.multaPaga));
 else if(Number(p.multa)>0)linhas.push('Multa registrada na parcela: '+dinheiro(p.multa)+' (recebimento não discriminado)');
 if(Number(p.pago)>Number(p.valor)&&p.jurosPagos==null&&p.multaPaga==null)linhas.push('Valor pago acima do valor atual da parcela: '+dinheiro(Number(p.pago)-Number(p.valor))+' (composição não discriminada)');
 if((p.status==='pago'||Number(p.pago)>=Number(p.valor))&&(p.perfilPagamento==='atrasado'||Number(p.diasDiferenca)>0)&&p.jurosPagos==null&&p.multaPaga==null)linhas.push('ℹ️ O histórico não discrimina os encargos efetivamente recebidos; o valor pago exibido é o registrado no sistema.');
 return linhas.length?'<div class="detalhesParcela">'+linhas.join('<br>')+'</div>':'';
}
export function linhaExtrato(p,formatar){
 const data=p.vencimento?.toDate?.()||(p.vencimento?new Date(p.vencimento):null);
 const vencimento=data&&!Number.isNaN(data.getTime())?data.toLocaleDateString('pt-BR'):'—';
 const status=p.status==='perdido'?'Encerrada como perda':p.status==='pago'||(Number(p.valor)>0&&Number(p.pago)>=Number(p.valor))?'🟢 Pago':'🔴 Em aberto';
 return `<tr><td>${esc(p.numero)}</td><td>${vencimento}</td><td>${esc(formatar(p.valor))}</td><td>${esc(formatar(p.pago))}</td><td>${status}</td></tr>`+(detalhesExtrato(p,formatar)?`<tr><td colspan="5">${detalhesExtrato(p,formatar)}</td></tr>`:'');
}
