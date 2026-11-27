// Apenas consulta e cópia: não altera cadastro nem realiza transferências.
export function dadosPixCliente(emprestimo,perfil){
 const atual=typeof perfil?.pix==='string'?perfil.pix.trim():'';
 const pedido=typeof emprestimo.pixCliente==='string'?emprestimo.pixCliente.trim():'';
 return {chave:atual||pedido,pais:emprestimo.pais==='PT'?'PT':'BR',fonte:atual?'cadastro':pedido?'pedido':null,divergente:!!atual&&!!pedido&&atual!==pedido};
}
export function criarPixCliente(emprestimo,perfil,root=document,clipboard=globalThis.navigator?.clipboard){
 const dados=dadosPixCliente(emprestimo,perfil),pt=dados.pais==='PT';
 const host=root.createElement('section');host.className='pixCliente';host.style.cssText='margin:12px 0;padding:12px;border:1px solid var(--border,#ddd);border-radius:10px;background:var(--surface,#fff);overflow-wrap:anywhere';
 const title=root.createElement('strong');title.textContent=pt?'📱 MB WAY do cliente':'🔑 Chave Pix do cliente';host.append(title);
 if(!dados.chave){const vazio=root.createElement('p');vazio.textContent=pt?'MB WAY não informado':'Chave Pix não informada';host.append(vazio);return host;}
 const field=root.createElement('input');field.type='text';field.readOnly=true;field.value=dados.chave;field.setAttribute('aria-label',pt?'MB WAY do cliente':'Chave Pix do cliente');field.style.cssText='display:block;box-sizing:border-box;width:100%;font-size:16px;margin:8px 0;padding:10px;user-select:text;-webkit-user-select:text';
 const select=()=>{field.focus();field.select();field.setSelectionRange(0,field.value.length);};field.addEventListener('click',select);
 const button=root.createElement('button');button.type='button';button.textContent=pt?'📋 Copiar MB WAY':'📋 Copiar chave Pix';button.style.minHeight='44px';
 const status=root.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.fontSize='13px';
 const nota=root.createElement('small');nota.textContent=(dados.fonte==='cadastro'?'Chave do cadastro atual. ':'Chave registrada no pedido. ')+(dados.divergente?'A chave foi atualizada após o pedido. ':'')+'Confira o titular no banco antes de transferir.';
 button.addEventListener('click',async()=>{
  select();let copied=false;
  try{copied=root.execCommand('copy')===true;}catch(e){}
  if(!copied){try{await clipboard.writeText(dados.chave);copied=true;}catch(e){}}
  status.textContent=copied?'Copiado! Pode colar no aplicativo do banco.':'O navegador bloqueou a cópia automática. Toque e mantenha pressionado o campo acima para copiar manualmente.';
 });
 host.append(field,button,status,nota);return host;
}
