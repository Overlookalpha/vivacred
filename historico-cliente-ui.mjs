import {carregarHistoricoCliente,diaHistorico} from './historico-cliente.mjs';
import {detalhesExtrato} from './extrato-detalhes.mjs';
import {resultadoPromessa} from './acompanhamento-pagamento.mjs';
import {displayDate} from './vencimentos.mjs';
export function criarHistoricoCliente(api){
 let dialog=null;
 const node=(tag,text,parent)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;parent?.append(el);return el;};
 const money=(v,pais)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:pais==='PT'?'EUR':'BRL'}).format(Number(v||0));
 const date=(v,pais)=>{const key=diaHistorico(v,pais);return key?displayDate(key):'Não registada';};
 async function abrir(uid,emprestimoId){
  if(dialog)return;
  const d=node('dialog');dialog=d;d.setAttribute('aria-label','Histórico completo do cliente');
  d.style.cssText='width:min(1000px,96vw);box-sizing:border-box;max-height:92vh;overflow:auto;padding:20px;border:1px solid var(--border,#ccc);border-radius:16px;background:var(--surface,#fff);color:var(--text,#111);overflow-wrap:anywhere';
  const close=node('button','Fechar histórico',d);close.type='button';close.style.cssText='position:sticky;top:0;float:right;z-index:1;min-height:44px';
  const dismiss=()=>{d.close();d.remove();dialog=null;};close.onclick=dismiss;d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
  const title=node('h2','Histórico completo',d);title.style.clear='both';
  const status=node('p','A consultar os registos atuais…',d);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const body=node('div',null,d);document.body.append(d);d.showModal();
  try{
   if(!uid&&emprestimoId){const loan=await api.getDocFromServer(api.doc(api.db,'emprestimos',emprestimoId));if(!loan.exists())throw Error('Empréstimo não encontrado.');uid=loan.data().userId;
    if(!uid&&loan.data().email){const users=await api.getDocsFromServer(api.query(api.collection(api.db,'usuarios'),api.where('email','==',loan.data().email)));if(users.docs.length===1)uid=users.docs[0].id;}
   }
   if(!uid)throw Error('Não foi possível identificar um único cadastro para este empréstimo. Confira o vínculo do cliente.');
   const data=await carregarHistoricoCliente(api,uid),{user,credito,contratos,linhas,totais}=data;
   title.textContent=user.nome||'Cliente';status.textContent='Histórico consultado agora · '+contratos.length+' empréstimo(s) / solicitação(ões) · '+linhas.length+' parcela(s).';
   node('p',[user.email,user.telefone].filter(Boolean).join(' · '),body);
   for(const warning of data.warnings){const p=node('p',warning,body);p.setAttribute('role','alert');p.style.color='var(--danger,#b91c1c)';}
   const overview=node('div',null,body);overview.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px';
   for(const pais of ['BR','PT']){
    const t=totais[pais],card=node('section',null,overview);card.className='resumoEmprestimo';
    node('h3',pais==='BR'?'Valores em reais':'Valores em euros',card);
    for(const [label,value] of [['Capital liberado registado',t.liberado],['Total recebido registado',t.recebido],['Juros recebidos discriminados',t.juros],['Multas recebidas discriminadas',t.multa],['Em aberto atualizado até hoje',t.aberto]])node('p',label+': '+money(value,pais),card);
    if(t.semDiscriminacao)node('small',t.semDiscriminacao+' parcela(s) com pagamento sem discriminação completa de juros/multa. Estes encargos não foram presumidos nem somados novamente ao recebido.',card);
   }
   node('p','O total recebido inclui o abatimento da parcela e os encargos recebidos separadamente nos novos lançamentos. Registos antigos não permitem reconstruir cada pagamento parcial nem separar todos os juros contratuais. Juros calculados e descontos de acordos não são tratados como dinheiro recebido.',body);
   const credit=node('section',null,body);credit.className='card';node('h3','Nota de pagamento e recuperação',credit);
   node('p','Nota atual de pagamento: '+(credito.nota==null?'Histórico insuficiente':credito.nota+'/100'),credit);
   node('p','Dias acumulados de atraso: '+credito.diasAcumulados+' · Maior atraso: '+credito.maiorAtraso+' dia(s) · Parcelas atualmente atrasadas: '+credito.atrasosAtuais,credit);
   node('p','Pontos recuperados: +'+credito.pontosRecuperados+' · Pagamentos pontuais considerados: '+credito.pontuaisRecuperacao+' · Antecipados considerados: '+credito.antecipadasRecuperacao,credit);
   node('p','Limite normal: '+money(credito.normal,user.pais)+' · Limite após avaliação: '+money(credito.limiteAvaliado,user.pais)+' · Disponível pelas regras de atraso: '+money(credito.disponivel,user.pais),credit);
   node('p','Redução: '+credito.reducaoPercentual+'%'+(credito.manual?' · Limite manual preservado.':''),credit);
   if(credito.bloqueado)node('p','Existem restrições por atraso, perda ou nota. Consulte as pendências abaixo.',credit);
   node('small','Mesma regra existente: recuperação após regularizar atrasos, +3 por pagamento pontual ou +5 por antecipação de pelo menos 5 dias, quando elegível. Não altera a nota nem o limite; outras regras de aprovação continuam válidas.',credit);
   if(credito.semDataReal)node('p',credito.semDataReal+' parcela(s) quitada(s) sem data real válida: não usadas para presumir pontualidade ou recuperação.',credit);
   node('h3','Empréstimos, parcelas, pagamentos e acordos',body);
   const ordered=[...contratos].sort((a,b)=>(diaHistorico(b.dataAprovacao||b.criadoEm)||'').localeCompare(diaHistorico(a.dataAprovacao||a.criadoEm)||''));
   if(!ordered.length)node('p','Nenhum empréstimo registado para este cliente.',body);
   for(const loan of ordered){
    const details=node('details',null,body);details.style.cssText='padding:14px;border:1px solid var(--border,#ddd);border-radius:12px;margin:12px 0';
    const ps=linhas.filter(p=>p.emprestimoId===loan.id).sort((a,b)=>Number(a.numero)-Number(b.numero));
    node('summary',(loan.status||'Sem estado')+(loan.arquivado?' · Arquivado':'')+' · '+date(loan.dataAprovacao||loan.criadoEm,loan.pais)+' · '+money(loan.valor,loan.pais)+' · '+ps.length+' parcela(s)',details);
    node('p','Referência: '+loan.id+' · Valor contratado: '+money(loan.valorFinal,loan.pais)+' · Parcelas quitadas: '+ps.filter(p=>p.quitada).length,details);
    if(loan.motivoRecusa)node('p','Motivo registado: '+loan.motivoRecusa,details);
    if(!ps.length)node('p','Sem parcelas registadas para esta solicitação.',details);
    for(const p of ps){
     const card=node('section',null,details);card.style.cssText='padding:12px;margin:12px 0;background:var(--bg,#f8fafc);border-radius:10px';
     node('h4','Parcela '+(p.numero||'—')+' · '+(p.status==='perdido'?'Encerrada como perda':p.status==='cancelado'?'Cancelada':p.quitada?'Paga':'Em aberto'),card);
     node('p','Vencimento: '+(p.vencimentoDia?displayDate(p.vencimentoDia):'Não registado')+' · Valor: '+money(p.valor,p.pais)+' · Recebido registado: '+money(p.recebidoReal,p.pais),card);
     node('p','Data real do pagamento: '+(p.pagamentoRealDia?displayDate(p.pagamentoRealDia):'Não registada')+' · '+(p.atrasoDias==null?'Atraso não verificável':p.atrasoDias+' dia(s) de atraso'+(p.quitada?' no pagamento':' até hoje')),card);
     const extra=node('div',null,card);extra.innerHTML=detalhesExtrato(p,v=>money(v,p.pais));
     const movimentos=data.pagamentos.filter(m=>m.parcelaId===p.id);
     if(movimentos.length){
      node('h4','Lançamentos individuais conferidos',card);
      for(const m of movimentos)node('p',date(m.dataPagamentoReal,p.pais)+' · Recebido neste lançamento: '+money(m.valorRecebido,p.pais)+' · Saldo contratual após: '+money(m.saldoDepois,p.pais)+(m.encargosDiscriminadosNoRecebimento?' · Parcela: '+money(m.valorParcelaRecebido,p.pais)+' · Juros: '+money(m.jurosRecebidos,p.pais)+' · Multa: '+money(m.multaRecebida,p.pais):' · Encargos não discriminados neste lançamento')+(m.tipo==='confirmar'?' · Confirmação de quitação':''),card);
      node('small','Estes lançamentos já estão incluídos no total pago da parcela. Não são somados novamente.',card);
     }
     const notices=data.promessas.filter(n=>n.scope==='cliente'||n.parcelaId===p.id);
     for(const notice of notices){const r=resultadoPromessa(notice,p,loan);node('p','🗓️ Promessa: '+date(notice.data,p.pais)+' · '+r.titulo+(notice.totalPrevisto!=null?' · Total previsto: '+money(notice.totalPrevisto,p.pais):' · Total original não registado'),card);}
     const history=node('button','Histórico de cobranças desta parcela',card);history.type='button';history.dataset.historicoCobranca=p.id;
    }
   }
   node('h3','Contactos de cobrança registados',body);
   if(!data.cobrancas.length)node('p','Sem contactos de cobrança registados. Envios antigos não foram presumidos.',body);
   for(const record of [...data.cobrancas].sort((a,b)=>(diaHistorico(b.criadoEm)||'').localeCompare(diaHistorico(a.criadoEm)||''))){
    node('p',date(record.criadoEm)+' · Parcela '+(record.numeroParcela||'—')+' · '+(record.status==='enviada'?'Envio confirmado manualmente em '+date(record.enviadoEm):'Mensagem preparada; envio não confirmado'),body);
   }
   node('small','Este painel reúne os registos disponíveis, incluindo empréstimos antigos e arquivados. Acordos mostram os dados preservados na parcela; versões antigas que não foram guardadas não podem ser reconstruídas.',body);
  }catch(e){status.textContent='Não foi possível carregar o histórico. '+(e.message||'Tente novamente.');}
 }
 document.addEventListener('click',event=>{const target=event.target.closest?.('[data-historico-cliente],[data-historico-emprestimo]');if(!target)return;event.preventDefault();void abrir(target.dataset.historicoCliente,target.dataset.historicoEmprestimo);});
 return {abrir};
}
