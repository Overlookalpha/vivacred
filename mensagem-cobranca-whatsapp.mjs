import {dateKey,displayDate} from './vencimentos.mjs';
import {calcularCobrancaParcela} from './cobranca-parcela.mjs';
// Text preparation only. No writes, notifications or automatic sending.
export function prepararWhatsAppParcela(parcela,emprestimo,now=new Date()){
 if(!parcela||!emprestimo||['pago','perdido','cancelado','finalizado'].includes(parcela.status)||emprestimo.finalizado||['quitado','finalizado','perdido','cancelado','rejeitado'].includes(emprestimo.status))throw Error('Esta parcela ou empréstimo está encerrado.');
 const pais=emprestimo.pais||'BR';
 const vencimento=dateKey(parcela.vencimento,pais),hoje=dateKey(now,pais);
 const dias=Math.round((Date.parse(vencimento+'T12:00:00Z')-Date.parse(hoje+'T12:00:00Z'))/86400000);
 const telefone=String(emprestimo.telefoneCliente||'').replace(/\D/g,'');
 if(!/^\d{10,15}$/.test(telefone))throw Error('Confira o telefone com código do país antes de abrir o WhatsApp.');
 // Keep the existing charge rules; align their calendar reference with the loan country.
 const [y,m,d]=hoje.split('-').map(Number),[vy,vm,vd]=vencimento.split('-').map(Number);
 const cobranca=calcularCobrancaParcela({...parcela,vencimento:new Date(vy,vm-1,vd,12)},new Date(y,m-1,d,12));
 if(!Number.isFinite(cobranca.totalAtualizado)||cobranca.totalAtualizado<=0)throw Error('Não há saldo em aberto para esta mensagem.');
 const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:pais==='PT'?'EUR':'BRL'}).format(v);
 const nome=emprestimo.nomeCliente||'Cliente',numero=parcela.numero||'—';
 const abertura=`Olá, ${nome}!${dias>=0?' 😊':''} Aqui é a Evellyn, assistente da IsaCred.`;
 const linhas=[abertura,''];
 if(dias>0){
  linhas.push(`A sua parcela nº ${numero}, no valor de ${money(cobranca.totalAtualizado)}, vence ${dias===1?'amanhã':`em ${dias} dias`}, em ${displayDate(vencimento)}.`,
   'Estamos a enviar este lembrete conforme a antecedência escolhida. Se precisar falar connosco, responda por aqui.');
 }else if(dias===0){
  linhas.push(`Lembramos que a sua parcela nº ${numero}, no valor de ${money(cobranca.totalAtualizado)}, vence hoje, ${displayDate(vencimento)}.`,
   'Após pagar, envie o comprovante para conferência. Se já enviou, desconsidere este lembrete.');
 }else{
  linhas.push(`A parcela nº ${numero}, com vencimento em ${displayDate(vencimento)}, consta em aberto há ${Math.abs(dias)} ${dias===-1?'dia':'dias'}.`,'',
   `💰 Valor original: ${money(cobranca.valorOriginal)}`);
  if(cobranca.valorPago>0)linhas.push(`✅ Já pago: ${money(cobranca.valorPago)}`);
  linhas.push(`➕ Multa: ${money(cobranca.multa)}`,`➕ Juros até hoje: ${money(cobranca.juros)}`,`📌 Total atualizado: ${money(cobranca.totalAtualizado)}`);
  if(parcela.acordoSemEncargos===true)linhas.push('🤝 Acordo sem multa e juros respeitado nesta parcela.');
  linhas.push('','Se já pagou, envie o comprovante para conferência. Caso precise combinar uma data de pagamento, fale connosco por aqui.');
 }
 const mensagem=linhas.join('\n');
 return {mensagem,diasRestantes:dias,url:'https://wa.me/'+telefone+'?text='+encodeURIComponent(mensagem)};
}
