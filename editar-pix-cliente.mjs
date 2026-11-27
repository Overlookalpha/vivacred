// Atualiza somente a chave do perfil vinculado, preservando o pedido original.
export async function salvarPixCliente(api,userId,anterior,nova){
 const chave=String(nova||'').trim();
 if(!userId||typeof userId!=='string'||userId.includes('/'))throw Error('Cliente sem cadastro vinculado. Não foi possível alterar a chave.');
 if(!chave||chave.length>254||/[\u0000-\u001f\u007f]/.test(chave))throw Error('Informe uma chave válida, sem quebras de linha, com até 254 caracteres.');
 const ref=api.doc(api.db,'usuarios',userId);
 await api.runTransaction(api.db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists())throw Error('Cadastro do cliente não encontrado.');
  if((snap.data().pix||'').trim()!==(anterior||'').trim())throw Error('A chave foi alterada em outra tela. Atualize a página antes de editar.');
  tx.update(ref,{pix:chave});
 });
 return chave;
}

export function criarEditorPix({root=document,chave='',nome='cliente',salvar,confirmar=globalThis.confirm,pt=false}){
 const host=root.createElement('div');
 const editar=root.createElement('button');editar.type='button';editar.textContent=pt?'✏️ Editar MB WAY':'✏️ Editar chave Pix';editar.style.minHeight='44px';
 const form=root.createElement('form');form.hidden=true;
 const label=root.createElement('label');label.textContent=pt?'Novo MB WAY':'Nova chave Pix';
 const input=root.createElement('input');input.type='text';input.required=true;input.maxLength=254;input.autocomplete='off';input.spellcheck=false;input.value=chave;input.style.cssText='display:block;box-sizing:border-box;width:100%;font-size:16px;padding:10px;margin:8px 0';label.append(input);
 const nota=root.createElement('p');nota.textContent='Atualiza o cadastro e os cartões deste cliente. Confira a chave e o titular antes de transferir.';
 const ok=root.createElement('button');ok.type='submit';ok.textContent='Salvar chave';ok.style.minHeight='44px';
 const cancelar=root.createElement('button');cancelar.type='button';cancelar.textContent='Cancelar';cancelar.style.minHeight='44px';
 const status=root.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 form.append(label,nota,ok,cancelar);host.append(editar,form,status);
 editar.addEventListener('click',()=>{form.hidden=false;editar.hidden=true;input.value=chave;status.textContent='';input.focus();});
 cancelar.addEventListener('click',()=>{form.hidden=true;editar.hidden=false;input.value=chave;status.textContent='';});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(ok.disabled)return;
  const nova=input.value.trim();
  if(!nova||nova.length>254||/[\u0000-\u001f\u007f]/.test(nova)){status.textContent='Informe uma chave válida, sem quebras de linha.';return;}
  if(nova===chave){form.hidden=true;editar.hidden=false;return;}
  if(!confirmar(`Salvar a nova chave de ${nome}?\n\n${nova}\n\nConfira os dados antes de confirmar.`))return;
  ok.disabled=cancelar.disabled=input.disabled=true;status.textContent='Salvando chave…';
  try{await salvar(nova);chave=nova;form.hidden=true;editar.hidden=false;status.textContent='Chave salva no cadastro.';}
  catch(error){status.textContent=error.message||'Não foi possível salvar. Tente novamente.';}
  finally{ok.disabled=cancelar.disabled=input.disabled=false;}
 });
 return host;
}
