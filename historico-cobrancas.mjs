export async function registrarContato(api,expected,prepared,id){
 const uid=api.auth.currentUser?.uid;if(!uid)throw Error('Entre novamente como administrador.');
 const ref=api.doc(api.db,'historicoCobrancas',id);
 await api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',uid));
  const parcel=await tx.get(api.doc(api.db,'parcelas',expected.parcelId));
  const prior=await tx.get(ref);
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(!parcel.exists()||parcel.data().emprestimoId!==expected.parcel.emprestimoId)throw Error('A parcela mudou. Atualize a página.');
  if(prior.exists())return;
  tx.set(ref,{
   parcelaId:expected.parcelId,emprestimoId:expected.parcel.emprestimoId,
   userId:expected.loan.userId||null,numeroParcela:expected.parcel.numero||null,
   telefone:expected.loan.telefoneCliente||'',mensagem:prepared.mensagem,
   canal:'whatsapp',status:'preparada',criadoEm:api.serverTimestamp(),criadoPor:uid
  });
 });
 return id;
}
export async function confirmarEnvio(api,id,parcelaId){
 const uid=api.auth.currentUser?.uid;if(!uid)throw Error('Entre novamente como administrador.');
 const ref=api.doc(api.db,'historicoCobrancas',id);
 await api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',uid)),record=await tx.get(ref);
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(!record.exists()||record.data().parcelaId!==parcelaId)throw Error('Contacto não encontrado para esta parcela.');
  if(record.data().status==='enviada')return;
  tx.update(ref,{status:'enviada',enviadoEm:api.serverTimestamp(),enviadoPor:uid});
 });
}
export function ordenarContatos(records){
 const millis=value=>value?.toMillis?.()??value?.toDate?.().getTime()??0;
 return [...records].sort((a,b)=>millis(b.criadoEm)-millis(a.criadoEm)||a.id.localeCompare(b.id));
}
