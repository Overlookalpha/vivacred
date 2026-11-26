import {dateKey,parseDate} from './vencimentos.mjs';
import {calcularCobrancaParcela} from './cobranca-parcela.mjs';
import {limiteEfetivo} from './perfil-credito.mjs';
import {limitesRecuperacao} from './functions/lib/recuperacaoCredito.mjs';
export function diaHistorico(value,pais='BR'){
 if(!value)return null;
 try{if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){parseDate(value);return value;}return dateKey(value?.toDate?value:new Date(value),pais);}catch{return null;}
}
const teste=x=>x.teste===true||x.tipoRegistro==='teste';
const money=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
export function selecionarHistorico(uid,user,loans,parcels,emailUnico=false){
 const contratos=loans.filter(l=>!teste(l)&&(l.userId?l.userId===uid:emailUnico&&!!user.email&&l.email===user.email));
 const ids=new Set(contratos.map(l=>l.id));
 return {contratos,parcelas:parcels.filter(p=>!teste(p)&&ids.has(p.emprestimoId)&&(!p.userId||p.userId===uid))};
}
export function resumoHistorico(user,contratos,parcelas,now=new Date()){
 const totais={BR:{liberado:0,recebido:0,juros:0,multa:0,aberto:0,semDiscriminacao:0},PT:{liberado:0,recebido:0,juros:0,multa:0,aberto:0,semDiscriminacao:0}};
 const loans=new Map(contratos.map(l=>[l.id,l]));
 for(const l of contratos)if(l.dataAprovacao||l.finalizado===true||['ativo','quitado','finalizado','perdido'].includes(l.status))totais[l.pais==='PT'?'PT':'BR'].liberado+=money(l.valor);
 const linhas=parcelas.map(p=>{
  const loan=loans.get(p.emprestimoId)||{},pais=loan.pais==='PT'?'PT':'BR',t=totais[pais];
  const pago=money(p.pago),valor=money(p.valor),quitada=p.status==='pago'||valor>0&&pago>=valor;
  const vencimento=diaHistorico(p.vencimento,pais),real=diaHistorico(p.dataPagamentoReal||p.dataPagamentoEfetivo,pais),hoje=diaHistorico(now,pais);
  const encerrada=['perdido','cancelado'].includes(p.status);
  const atraso=vencimento&&(!quitada||real&&real<=hoje)?Math.max(0,Math.round((Date.parse((quitada?real:hoje)+'T12:00:00Z')-Date.parse(vencimento+'T12:00:00Z'))/86400000)):null;
  t.recebido+=pago;
  // Never infer received interest from an outstanding charge or contract markup.
  t.juros+=pago>0?money(p.jurosPagos):0;t.multa+=pago>0?money(p.multaPaga):0;
  if(pago>0&&(p.jurosPagos==null||p.multaPaga==null))t.semDiscriminacao++;
  if(!quitada&&!encerrada){
   if(vencimento){const [y,m,d]=vencimento.split('-').map(Number),[hy,hm,hd]=hoje.split('-').map(Number);t.aberto+=calcularCobrancaParcela({...p,vencimento:new Date(y,m-1,d,12)},new Date(hy,hm-1,hd,12)).totalAtualizado;}
   else t.aberto+=Math.max(0,valor-pago);
  }
  return {...p,pais,quitada,vencimentoDia:vencimento,pagamentoRealDia:real,atrasoDias:encerrada?null:atraso};
 });
 for(const t of Object.values(totais))for(const key of ['liberado','recebido','juros','multa','aberto'])t[key]=Math.round(t[key]*100)/100;
 return {totais,linhas,credito:limitesRecuperacao(user,limiteEfetivo(user),contratos,parcelas,now)};
}
export async function carregarHistoricoCliente(api,uid){
 const s=await api.getDocFromServer(api.doc(api.db,'usuarios',uid));if(!s.exists())throw Error('Cadastro do cliente não encontrado.');
 const user=s.data(),records=new Map(),warnings=[];
 const query=async(c,f,v)=>api.getDocsFromServer(api.query(api.collection(api.db,c),api.where(f,'==',v)));
 const add=snap=>snap.docs.forEach(d=>records.set(d.id,{...d.data(),id:d.id}));
 add(await query('emprestimos','userId',uid));
 let unico=false;
 if(user.email){const matches=await query('usuarios','email',user.email);unico=matches.docs.length===1&&matches.docs[0].id===uid;if(unico)add(await query('emprestimos','email',user.email));else warnings.push('Registos antigos ligados apenas ao email não foram unidos porque o email pertence a mais de um cadastro.');}
 const selected=selecionarHistorico(uid,user,[...records.values()],[],unico),parcelas=[];
 for(const l of selected.contratos){const snap=await query('parcelas','emprestimoId',l.id);for(const d of snap.docs)parcelas.push({...d.data(),id:d.id});}
 const data=selecionarHistorico(uid,user,selected.contratos,parcelas,unico);
 const extra=async collection=>{
  const found=new Map();
  try{const add=s=>s.docs.forEach(d=>found.set(d.id,{...d.data(),id:d.id}));add(await query(collection,'userId',uid));for(const l of data.contratos)add(await query(collection,'emprestimoId',l.id));return [...found.values()].filter(x=>(!x.userId||x.userId===uid)&&(!x.emprestimoId||data.contratos.some(l=>l.id===x.emprestimoId)));}
  catch{warnings.push('Não foi possível carregar '+collection+'. Tente atualizar o histórico.');return [];}
 };
 const [promessas,cobrancas]=await Promise.all([extra('promessasPagamento'),extra('historicoCobrancas')]);
 return {uid,user,...data,promessas,cobrancas,warnings,...resumoHistorico(user,data.contratos,data.parcelas,api.now?.()||new Date())};
}
