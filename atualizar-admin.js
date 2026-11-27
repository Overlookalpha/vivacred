// Recarrega os dados mantendo a autenticação existente.
(()=>{
 const botao=document.getElementById('atualizarAdmin');if(!botao)return;
 const telas=['dashboard','solicitacoes','emprestimos','historico','config','financeiro','inteligencia','usuarios','saques'];
 const chave='vivacred-aba-apos-atualizar';
 let editou=false;
 document.addEventListener('input',e=>{
  const campo=e.target;
  if(campo.matches('input,textarea,select')&&campo.type!=='search'&&!campo.readOnly&&!campo.closest('.filtrosEmprestimos'))editou=true;
 });
 try{const tela=sessionStorage.getItem(chave);sessionStorage.removeItem(chave);if(telas.includes(tela))window.abrirTela(tela);}catch{}
 botao.addEventListener('click',()=>{
  if(botao.disabled)return;
  if((editou||document.querySelector('dialog[open]'))&&!window.confirm('Atualizar a página agora? Salve primeiro qualquer edição ou operação em andamento. Dados ainda não salvos serão perdidos.'))return;
  const tela=telas.find(nome=>{const el=document.getElementById('tela'+nome[0].toUpperCase()+nome.slice(1));return el&&el.style.display!=='none';})||'dashboard';
  try{sessionStorage.setItem(chave,tela);}catch{}
  botao.disabled=true;botao.textContent='⏳ Atualizando…';window.location.reload();
 });
})();
