const tipos=['contas','pedidos','pagamentos','vencidas','conferir','cadastros','avisos'];
export function referenciaDispensa(tipo,id){
 if(!tipos.includes(tipo)||typeof id!=='string'||!id||id.includes('/')||id.length>180)throw Error('Aviso inválido.');
 return tipo+'-'+id;
}
export function assinaturaAviso(tipo,row){
 // Cadastro volta a ser conferido quando algum campo relevante muda.
 const dados=tipo==='cadastros'?{nome:row.nome||'',telefone:row.telefone||'',email:row.email||'',cpf:row.cpf||'',nif:row.nif||'',pix:row.pix||'',pais:row.pais||'',problemas:row.problemas}:Object.fromEntries(Object.entries(row).filter(([k])=>!['dispensado','assinatura'].includes(k)));
 return JSON.stringify(dados);
}
export function aplicarDispensas(dados,registros=[]){
 const mapa=new Map(registros.map(r=>[r.id,r]));
 return Object.fromEntries(tipos.map(tipo=>[tipo,(dados[tipo]||[]).map(row=>{
  const assinatura=assinaturaAviso(tipo,row),registro=mapa.get(referenciaDispensa(tipo,row.id));
  return {...row,assinatura,dispensado:registro?.status==='dispensado'&&registro.assinatura===assinatura};
 })]));
}
export async function salvarDispensa(api,tipo,row,restaurar=false){
 const uid=api.auth.currentUser?.uid;if(!uid)throw Error('Entre novamente como administrador.');
 const id=referenciaDispensa(tipo,row.id),ref=api.doc(api.db,'pendenciasDispensadas',id);
 await api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',uid)),anterior=await tx.get(ref);
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(restaurar&&(!anterior.exists()||anterior.data().assinatura!==row.assinatura))throw Error('Este aviso mudou. Atualize a central antes de restaurar.');
  tx.set(ref,{tipo,referencia:row.id,assinatura:row.assinatura||assinaturaAviso(tipo,row),status:restaurar?'restaurado':'dispensado',por:uid,em:api.serverTimestamp()});
 });
}
