import {dateKey,parseDate,displayDate,signature} from './vencimentos.mjs';
import {calcularCobrancaParcela} from './cobranca-parcela.mjs';
export {displayDate};
export const noticeKey=(scope,id)=>{
 if(!['cliente','parcela'].includes(scope)||typeof id!=='string'||!id||id.includes('/')||id.length>150)throw Error('Referência do aviso inválida.');
 return scope+'-'+id;
};
export function noticeState(notice,now=new Date()){
 if(!notice||notice.status!=='ativa')return {active:false,label:''};
 try{parseDate(notice.data);}catch{return {active:true,invalid:true,label:'Aviso com data inválida: confira antes de cobrar.'};}
 const today=dateKey(now,notice.pais||'BR');
 return {active:notice.data>=today,expired:notice.data<today,today:notice.data===today,label:notice.data<today?'Prazo prometido vencido em '+displayDate(notice.data):notice.data===today?'Pagamento prometido para hoje — aguardar até o fim do dia':'Prometeu pagar em '+displayDate(notice.data)+' — aguardar até essa data (inclusive)'};
}
export function resultadoPromessa(notice,parcel,loan,now=new Date()){
 const state=noticeState(notice,now),pais=loan.pais||notice.pais||'BR';
 if(state.invalid)return {tipo:'conferir',titulo:'Conferir data combinada',detalhe:state.label};
 if(notice.status!=='ativa')return {tipo:'cancelada',titulo:'Promessa cancelada',detalhe:'Este aviso já não pausa a cobrança.'};
 if(['perdido','cancelado'].includes(parcel.status))return {tipo:'conferir',titulo:'Parcela encerrada — conferir',detalhe:'O encerramento não confirma que a promessa foi cumprida.'};
 const valor=Number(parcel.valor),pago=Number(parcel.pago||0);
 const quitada=parcel.status==='pago'||(valor>0&&Number.isFinite(valor)&&Number.isFinite(pago)&&pago>=valor);
 if(quitada){
  const real=parcel.dataPagamentoReal||parcel.dataPagamentoEfetivo;
  let key=null;
  try{if(typeof real==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(real)){parseDate(real);key=real;}else if(real)key=dateKey(real?.toDate?real:new Date(real),pais);}catch{}
  if(!key||key>dateKey(now,pais))return {tipo:'conferir',titulo:'Paga — prazo a confirmar',detalhe:'Falta uma data real de pagamento válida para verificar se cumpriu o combinado.'};
  return key<=notice.data?{tipo:'cumprida',titulo:'Promessa cumprida no prazo',detalhe:'Pagamento integral em '+displayDate(key)+'.'}:{tipo:'fora',titulo:'Paga após o prazo combinado',detalhe:'Pagamento integral em '+displayDate(key)+', após a data prometida.'};
 }
 return state.expired?{tipo:'vencida',titulo:'Prazo vencido — pagamento não concluído',detalhe:pago>0?'Há pagamento parcial, mas a parcela ainda está em aberto.':'Não há quitação registada para esta parcela.'}:{tipo:'aguardando',titulo:state.today?'Promessa para hoje':'Aguardando a data combinada',detalhe:'Aguardar até ao fim de '+displayDate(notice.data)+'. Juros e multa continuam conforme as regras da parcela.'};
}
export function projection(parcel,loan,key,calculate,now=new Date()){
 parseDate(key);
 if(key<dateKey(now,loan.pais||'BR'))throw Error('Escolha hoje ou uma data futura.');
 if(['pago','perdido','cancelado','finalizado'].includes(parcel.status)||parcel.teste===true||parcel.tipoRegistro==='teste')throw Error('Esta parcela não está disponível para estimativa.');
 for(const field of ['valor','pago'])if(!Number.isFinite(Number(parcel[field]||0))||Number(parcel[field]||0)<0)throw Error('Confira os valores registrados na parcela.');
 const [y,m,d]=key.split('-').map(Number);
 const result=calculate(parcel,new Date(y,m-1,d,12));
 if(!Number.isFinite(result.totalAtualizado)||result.totalAtualizado<=0)throw Error('Não há saldo para estimar nesta parcela.');
 return {...result,date:key,currency:loan.pais==='PT'?'EUR':'BRL'};
}
export async function saveNotice(api,expected,input,actor,operationId,now=()=>new Date()){
 if(!actor)throw Error('Acesso administrativo necessário.');
 if(!['ativa','cancelada'].includes(input.status)||!['cliente','parcela'].includes(input.scope))throw Error('Aviso inválido.');
 const note=String(input.observacao||'').trim();if(note.length>500)throw Error('A observação aceita até 500 caracteres.');
 if(input.status==='ativa'){
  parseDate(input.data);
  if(input.data<dateKey(now(),expected.loan.pais||'BR'))throw Error('A data prometida não pode ser anterior a hoje.');
 }
 const subject=input.scope==='cliente'?expected.loan.userId:expected.parcelId;
 const key=noticeKey(input.scope,subject),ref=api.doc(api.db,'promessasPagamento',key),audit=api.doc(api.db,'historicoPromessasPagamento',operationId);
 return api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',actor));
  const parcel=await tx.get(api.doc(api.db,'parcelas',expected.parcelId));
  const loan=await tx.get(api.doc(api.db,'emprestimos',expected.parcel.emprestimoId));
  const current=await tx.get(ref),prior=await tx.get(audit);
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(prior.exists())throw Error('Esta operação já foi registrada. Reabra o aviso.');
  if(!parcel.exists()||!loan.exists()||signature(parcel.data())!==signature(expected.parcel)||signature(loan.data())!==signature(expected.loan))throw Error('A parcela ou o empréstimo mudou. Reabra e confira antes de salvar.');
  if(signature(current.exists()?current.data():null)!==signature(expected.notice||null))throw Error('Outro administrador alterou este aviso. Reabra e confira.');
  if(input.status==='ativa'&&(['pago','perdido','cancelado'].includes(parcel.data().status)||['finalizado','quitado','cancelado','rejeitado'].includes(loan.data().status)||loan.data().finalizado))throw Error('O empréstimo ou a parcela está encerrado.');
  const next={status:input.status,data:input.status==='ativa'?input.data:(current.data()?.data||null),observacao:note,pais:expected.loan.pais||'BR',scope:input.scope,userId:expected.loan.userId||null,parcelaId:expected.parcelId,emprestimoId:expected.parcel.emprestimoId,alteradoPor:actor,alteradoEm:api.serverTimestamp()};
  if(input.status==='ativa'){
   const estimate=projection(parcel.data(),loan.data(),input.data,api.calculate||calcularCobrancaParcela,now());
   next.totalPrevisto=estimate.totalAtualizado;
   next.moedaPrevista=expected.loan.pais==='PT'?'EUR':'BRL';
  }else if(Number.isFinite(current.data()?.totalPrevisto)){
   next.totalPrevisto=current.data().totalPrevisto;next.moedaPrevista=current.data().moedaPrevista||'BRL';
  }
  tx.set(ref,next);
  tx.set(audit,{avisoId:key,antes:current.exists()?{status:current.data().status,data:current.data().data}:null,depois:{status:next.status,data:next.data},por:actor,em:api.serverTimestamp()});
  return next;
 });
}
