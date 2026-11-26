// Disponível independentemente do carregamento do Firebase e do painel.
(function(){
 window.copiarLinkCadastro=function(){
  const existente=document.getElementById('compartilharCadastro');
  if(existente){existente.hidden=false;existente.scrollIntoView({block:'center'});return;}
  const link=new URL('cadastro.html',window.location.href);link.search='';link.hash='';
  const painel=document.createElement('section');painel.id='compartilharCadastro';painel.className='card';painel.setAttribute('aria-label','Compartilhar cadastro');
  painel.style.cssText='position:fixed;top:90px;left:50%;transform:translateX(-50%);width:min(480px,90vw);box-sizing:border-box;z-index:100000;background:white;color:#172033;padding:22px;border:2px solid #ea580c;border-radius:16px;box-shadow:0 12px 60px #0005';
  const titulo=document.createElement('h3');titulo.textContent='Enviar o link ao cliente';
  const texto=document.createElement('p');texto.textContent='Copie o endereço abaixo ou abra o WhatsApp para escolher o cliente.';
  const campo=document.createElement('textarea');campo.readOnly=true;campo.rows=2;campo.value=link.href;campo.setAttribute('aria-label','Link de cadastro');campo.style.cssText='display:block;width:100%;box-sizing:border-box;font-size:16px;padding:12px;color:#172033;background:#fff;border:1px solid #94a3b8;border-radius:8px;user-select:text;-webkit-user-select:text';
  const selecionar=()=>{campo.focus();campo.select();campo.setSelectionRange(0,campo.value.length);};campo.addEventListener('click',selecionar);
  const resultado=document.createElement('p');resultado.setAttribute('role','status');resultado.textContent='Também pode manter o dedo sobre o endereço e escolher Copiar.';
  const copiar=document.createElement('button');copiar.type='button';copiar.textContent='Copiar link';
  copiar.addEventListener('click',async()=>{
   // Executa a alternativa síncrona no próprio toque, antes de qualquer espera.
   selecionar();let ok=false;try{ok=document.execCommand('copy');}catch(e){}
   if(!ok){try{await navigator.clipboard.writeText(link.href);ok=true;}catch(e){}}
   resultado.textContent=ok?'Link copiado! Agora pode colar e enviar.':'O navegador bloqueou a cópia. Mantenha o dedo no endereço e escolha Copiar, ou use o WhatsApp abaixo.';
  });
  const whats=document.createElement('a');whats.textContent='Enviar pelo WhatsApp';whats.href='https://wa.me/?text='+encodeURIComponent('Crie sua conta no IsaCred: '+link.href);whats.target='_blank';whats.rel='noopener';whats.style.cssText='display:inline-block;background:#15803d;color:white;padding:12px;border-radius:8px;margin:8px;text-decoration:none';
  const fechar=document.createElement('button');fechar.type='button';fechar.textContent='Fechar';fechar.addEventListener('click',()=>{painel.hidden=true;});
  painel.append(titulo,texto,campo,copiar,whats,resultado,fechar);document.body.append(painel);selecionar();
 };
})();
