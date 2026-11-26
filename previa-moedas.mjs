// Apenas leitura: espelha os bônus já usados ao confirmar uma parcela no admin.
export function previaMoedas(parcela,emprestimo,cliente,hoje=new Date()){
 const valor=Number(parcela.valor),v=parcela.vencimento?.toDate?.()||new Date(parcela.vencimento);
 if(!Number.isFinite(valor)||valor<=0||Number.isNaN(+v))return null;
 const inicio=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
 const dias=Math.floor((inicio(hoje)-inicio(v))/86400000);
 const antecipacao=dias<=-30?200:dias<=-15?100:dias<=-10?50:dias<=-5?25:dias<0?10:0;
 const quitacao=Number(emprestimo.parcelas)>0&&Number(emprestimo.parcelasPagas||0)+1>=Number(emprestimo.parcelas)?100:0;
 const indicacao=quitacao&&cliente.indicadoPor&&cliente.indicacaoPremiada!==true?5000:0;
 const base=Math.round(valor);return {base,antecipacao,quitacao,indicacao,total:base+antecipacao+quitacao+indicacao};
}
export function aguardandoConferencia(p){
 if(p.status==='pago'||Number(p.pago||0)>=Number(p.valor))return false;
 const t=v=>{const d=v?.toDate?.()||(v?new Date(v):null);return d&&!Number.isNaN(+d)?+d:0;};
 const informado=t(p.pagamentoInformadoEm);
 return informado>0&&informado>Math.max(t(p.pagoEm),t(p.ultimaDataPagamento));
}
export function textoPreviaMoedas(p){
 if(!p)return 'Não foi possível calcular a prévia das moedas.';
 return `🪙 Confirmando a quitação desta parcela com pagamento hoje: ${p.total.toLocaleString('pt-BR')} ISC previstos. ${p.base} pela parcela + ${p.antecipacao} por antecipação + ${p.quitacao} por quitar o empréstimo`+(p.indicacao?` + ${p.indicacao} pela indicação`:'')+'. A antecipação não reduz o valor contratado. As moedas entram após o administrador conferir e confirmar o pagamento, considerando a data real e as condições da quitação.';
}
