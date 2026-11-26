import {dateKey} from './vencimentos.mjs';
import {calcularCobrancaParcela} from './cobranca-parcela.mjs';

export function diasAte(parcela,pais,now=new Date()){
 try{return Math.round((Date.parse(dateKey(parcela.vencimento,pais)+'T12:00:00Z')-Date.parse(dateKey(now,pais)+'T12:00:00Z'))/86400000);}catch{return null;}
}
const normalizar=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function corresponde(item,{busca='',prazo='',pais='',pagamento='',situacao=''}={},now=new Date()){
 const emp=item.emp,pendentes=item.pendentes;
 const dias=pendentes.map(p=>diasAte(p,emp.pais||'BR',now));
 return normalizar(emp.nomeCliente+' '+(emp.email||'')+' '+(emp.telefoneCliente||'')).includes(normalizar(busca).trim()) &&
  (!pais||(emp.pais||'BR')===pais) &&
  (!situacao||(situacao==='quitados'?item.quitado===true:item.quitado!==true)) &&
  (!pagamento||(item.pagas===0&&!pendentes.some(p=>Number(p.pago||0)>0))) &&
  (!prazo||(prazo==='atrasado'?dias.some(d=>d!==null&&d<0):prazo==='hoje'?dias.includes(0):prazo==='cinco'?dias.some(d=>d!==null&&d>=1&&d<=5):prazo==='quitado'?item.quitado===true:false));
}
export function resumirVencimentos(items,now=new Date()){
 const result=Object.fromEntries(['atrasado','hoje','cinco'].map(k=>[k,{clientes:0,parcelas:0,BR:0,PT:0}]));
 const clientes={atrasado:new Set(),hoje:new Set(),cinco:new Set()};
 for(const item of items)for(const p of item.pendentes){
  const pais=item.emp.pais==='PT'?'PT':'BR',dias=diasAte(p,pais,now);
  if(dias===null)continue;
  const grupo=dias<0?'atrasado':dias===0?'hoje':dias<=5?'cinco':null;
  if(!grupo)continue;
  const hoje=dateKey(now,pais).split('-').map(Number),vence=dateKey(p.vencimento,pais).split('-').map(Number);
  const valor=calcularCobrancaParcela({...p,vencimento:new Date(vence[0],vence[1]-1,vence[2],12)},new Date(hoje[0],hoje[1]-1,hoje[2],12)).totalAtualizado;
  if(!Number.isFinite(valor)||valor<=0)continue;
  result[grupo][pais]=Math.round((result[grupo][pais]+valor)*100)/100;
  result[grupo].parcelas++;
  clientes[grupo].add(item.emp.userId||item.emp.email||item.id);
 }
 for(const k of Object.keys(result))result[k].clientes=clientes[k].size;
 return result;
}
export function validarTelefone(value,pais){
 const raw=String(value||'').trim();
 if(!/^\+?[\d\s().-]+$/.test(raw))throw Error('Use apenas números e o indicativo do país.');
 const digits=raw.replace(/\D/g,'');
 if(pais==='PT'?!/^351\d{9}$/.test(digits):!/^55\d{10,11}$/.test(digits))throw Error(pais==='PT'?'Informe +351 e os 9 algarismos do número.':'Informe +55, o DDD e o número de telefone.');
 return '+'+digits;
}
// Only contact fields are changed, atomically; never debt or payment data.
export async function salvarTelefone(api,item,value){
 const telefone=validarTelefone(value,item.emp.pais||'BR'),uid=api.auth.currentUser?.uid;
 if(!uid)throw Error('Entre novamente como administrador.');
 const loanRef=api.doc(api.db,'emprestimos',item.id);
 const profileRef=item.emp.userId?api.doc(api.db,'usuarios',item.emp.userId):null;
 await api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',uid));
  const loan=await tx.get(loanRef);
  const profile=profileRef?await tx.get(profileRef):null;
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(!loan.exists()||loan.data().userId!==item.emp.userId)throw Error('O cadastro mudou. Atualize a página.');
  if(String(loan.data().telefoneCliente||'')!==String(item.emp.telefoneCliente||''))throw Error('O telefone foi alterado por outra pessoa. Atualize a página antes de editar.');
  if(profile?.exists()&&String(profile.data().telefone||'')!==String(item.telefoneCadastro||''))throw Error('O telefone do cadastro mudou. Atualize a página antes de editar.');
  tx.update(loanRef,{telefoneCliente:telefone});
  if(profile?.exists())tx.update(profileRef,{telefone});
 });
 return telefone;
}
