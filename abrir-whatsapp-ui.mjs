// A navegação externa acontece apenas no toque do administrador no link real.
export function mostrarMensagemWhatsApp(prepared,root=document){
 const url=new URL(prepared.url);
 if(url.protocol!=='https:'||url.hostname!=='wa.me')throw Error('Link do WhatsApp inválido.');
 const d=root.createElement('dialog');d.setAttribute('aria-label','Mensagem pronta para WhatsApp');
 d.style.cssText='width:min(620px,94vw);box-sizing:border-box;max-height:90vh;overflow:auto;border:1px solid var(--border,#ddd);border-radius:14px;padding:20px;background:var(--surface,#fff);color:var(--text,#111)';
 const title=root.createElement('h3');title.textContent='💬 Mensagem pronta';
 const nota=root.createElement('p');nota.textContent='Toque no botão verde para abrir a conversa. Confira a mensagem e envie pelo WhatsApp. Nada foi enviado automaticamente.';
 const abrir=root.createElement('a');abrir.href=url.href;abrir.target='_blank';abrir.rel='noopener noreferrer';abrir.textContent='Abrir conversa no WhatsApp';abrir.style.cssText='display:block;box-sizing:border-box;min-height:44px;background:#15803d;color:white;text-align:center;padding:14px;border-radius:10px;font-weight:700;text-decoration:none';
 const texto=root.createElement('textarea');texto.readOnly=true;texto.value=prepared.mensagem;texto.rows=9;texto.setAttribute('aria-label','Mensagem para copiar');texto.style.cssText='display:block;box-sizing:border-box;width:100%;font-size:16px;margin:14px 0;padding:10px;user-select:text;-webkit-user-select:text';
 const ajuda=root.createElement('p');ajuda.textContent='Se o aplicativo não abrir, pode copiar a mensagem acima e colar na conversa do cliente.';
 const fechar=root.createElement('button');fechar.type='button';fechar.textContent='Fechar';fechar.style.minHeight='44px';
 const dismiss=()=>{d.close();d.remove();};fechar.addEventListener('click',dismiss);d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
 d.append(title,nota,abrir,texto,ajuda,fechar);root.body.append(d);d.showModal();return d;
}
