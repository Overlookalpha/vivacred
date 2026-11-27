import {resumirPendencias} from './central-pendencias.mjs';
export function iniciarCentralPendencias({host,cadastros,carregar,acoes,root=document}){
 const node=(tag,text,parent)=>{const el=root.createElement(tag);if(text!=null)el.textContent=text;parent?.append(el);return el;};
 const botao=(text,parent,fn)=>{const b=node('button',text,parent);b.type='button';b.style.minHeight='44px';b.addEventListener('click',async()=>{try{await fn();}catch{status.textContent='Não foi possível abrir esta ação. Atualize a central e tente novamente.';}});return b;};
 node('h3','📌 Central de pendências',host);
 node('p','Confira o que precisa da sua atenção. Informar um pagamento não confirma o recebimento.',host);
 const status=node('p','Carregando pendências…',host);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const atualizar=botao('Atualizar pendências',host,refresh);
 const body=node('div',null,host);body.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px';
 node('h3','🔎 Conferência dos cadastros',cadastros);
 node('p','Avisos para revisão manual. Não valida titularidade de Pix, existência de e-mail ou situação de CPF/NIF. Nenhum dado é corrigido automaticamente.',cadastros);
 const cadastroStatus=node('p','Carregando cadastros…',cadastros);cadastroStatus.setAttribute('role','status');
 const buscaLabel=node('label','Buscar cliente com cadastro a conferir',cadastros);
 const busca=node('input',null,buscaLabel);busca.type='search';busca.placeholder='Nome, telefone ou e-mail';busca.style.cssText='display:block;width:100%;box-sizing:border-box;font-size:16px;padding:10px;margin:8px 0';
 const lista=node('div',null,cadastros);let dados=null;
 function renderCadastros(){
  lista.replaceChildren();if(!dados)return;
  const q=busca.value?.trim().toLocaleLowerCase('pt')||'';
  const rows=dados.cadastros.filter(u=>[u.nome,u.telefone,u.email].join(' ').toLocaleLowerCase('pt').includes(q));
  cadastroStatus.textContent=`${dados.cadastros.length} cadastro(s) precisam de revisão. ${rows.length} exibido(s).`;
  if(!rows.length)node('p',q?'Nenhum resultado para esta busca.':'Nenhuma pendência encontrada nos campos conferidos.',lista);
  for(const u of rows){
   const card=node('details',null,lista);card.style.cssText='padding:12px;border:1px solid var(--border,#ddd);border-radius:10px;margin:10px 0;overflow-wrap:anywhere';
   node('summary',`${u.nome||'Cliente sem nome'} · ${u.problemas.length} aviso(s)`,card);
   const ul=node('ul',null,card);for(const p of u.problemas)node('li',p,ul);
   botao('Abrir cadastro',card,()=>acoes.cadastro(u));
   botao(u.pais==='PT'?'Editar MB WAY':'Editar chave Pix',card,()=>acoes.pix(u,refresh));
  }
 }
 busca.addEventListener('input',renderCadastros);
 function grupo(titulo,rows,label,action){
  const card=node('section',null,body);card.style.cssText='padding:14px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);overflow-wrap:anywhere';
  node('h4',`${titulo} · ${rows.length}`,card);
  if(!rows.length){node('p','Nenhuma pendência.',card);return;}
  const details=node('details',null,card);node('summary','Ver pendências',details);
  for(const row of rows){const item=node('div',null,details);item.style.cssText='padding:10px 0;border-bottom:1px solid var(--border,#ddd)';node('strong',row.nome,item);if(row.parcela)node('p','Parcela '+row.parcela,item);if(row.data)node('p','Data combinada: '+row.data.split('-').reverse().join('/'),item);if(row.motivo)node('p',row.motivo,item);botao(label,item,()=>action(row));}
 }
 async function refresh(){
  atualizar.disabled=true;host.setAttribute('aria-busy','true');status.textContent='Consultando dados atuais…';
  try{
   const raw=await carregar();dados=resumirPendencias(raw);body.replaceChildren();
   grupo('🆕 Contas para aprovar',dados.contas,'Ver aprovação',acoes.contas);
   grupo('📥 Pedidos de empréstimo',dados.pedidos,'Abrir pedidos',acoes.pedidos);
   grupo('💳 Pagamentos para conferir',dados.pagamentos,'Conferir parcelas',acoes.parcelas);
   grupo('🗓️ Promessas vencidas',dados.vencidas,'Revisar promessa',acoes.parcelas);
   grupo('⚠️ Promessas a conferir',dados.conferir,'Ver detalhes',r=>r.emprestimoId?acoes.parcelas(r):acoes.cliente(r));
   renderCadastros();status.textContent='Atualizado às '+new Date().toLocaleTimeString('pt-PT')+'. Use Atualizar pendências após resolver uma situação.';
  }catch{
   status.textContent='Não foi possível atualizar as pendências. Tente novamente. Os números anteriores, se visíveis, podem estar desatualizados.';
   cadastroStatus.textContent='Não foi possível atualizar os cadastros. Tente novamente na central de pendências.';
  }finally{atualizar.disabled=false;host.setAttribute('aria-busy','false');}
 }
 refresh();return {refresh};
}
