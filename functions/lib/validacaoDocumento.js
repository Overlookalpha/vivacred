// Validação matemática; não comprova titularidade nem situação fiscal.
(function(root){
 function documentoValido(valor,pais){
  const n=String(valor||'').replace(/\D/g,'');
  if(/^(\d)\1+$/.test(n))return false;
  if(pais==='BR'){
   if(n.length!==11)return false;
   for(let tamanho=9;tamanho<=10;tamanho++){
    let soma=0;for(let i=0;i<tamanho;i++)soma+=Number(n[i])*(tamanho+1-i);
    const resto=(soma*10)%11;if(Number(n[tamanho])!==(resto===10?0:resto))return false;
   }return true;
  }
  if(pais==='PT'){
   if(n.length!==9)return false;
   let soma=0;for(let i=0;i<8;i++)soma+=Number(n[i])*(9-i);
   const digito=11-soma%11;return Number(n[8])===(digito>=10?0:digito);
  }return false;
 }
 if(typeof module==='object'&&module.exports)module.exports={documentoValido};
 else root.documentoCadastroValido=documentoValido;
})(globalThis);
