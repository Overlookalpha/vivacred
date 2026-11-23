"use strict";
const {limiteEfetivo} = require('./limiteCredito');

// Todas as leituras podem participar da mesma transação da solicitação.
async function perfilCredito(db, leitor, uid, usuario, pais, nivel) {
  const get = ref => leitor.get(ref);
  const emprestimos = new Map();
  const adicionar = snap => snap.docs.forEach(doc=>{
    const c=doc.data();
    if(c.teste===true||c.tipoRegistro==='teste')return;
    if(c.userId&&c.userId!==uid)return;
    emprestimos.set(doc.id,{...c,id:doc.id});
  });
  adicionar(await get(db.collection('emprestimos').where('userId','==',uid)));
  // Compatibilidade sem unir históricos de perfis com o mesmo e-mail.
  if(usuario.email){
    const usuarios=await get(db.collection('usuarios').where('email','==',usuario.email).limit(2));
    if(usuarios.docs.length===1&&usuarios.docs[0].id===uid){
      adicionar(await get(db.collection('emprestimos').where('email','==',usuario.email)));
    }
  }
  const parcelas=new Map();
  for(const id of emprestimos.keys()){
    const snap=await get(db.collection('parcelas').where('emprestimoId','==',id));
    for(const doc of snap.docs){const p=doc.data();if(!p.userId||p.userId===uid)parcelas.set(doc.id,p);}
  }
  const {limitesRecuperacao}=await import('./recuperacaoCredito.mjs');
  return limitesRecuperacao(usuario,limiteEfetivo(usuario,pais,nivel),[...emprestimos.values()],[...parcelas.values()]);
}
module.exports={perfilCredito};
