import {resumirPendencias} from './central-pendencias.mjs';
import {aplicarDispensas} from './dispensar-pendencias.mjs';
export function iniciarCentralPendencias({host,cadastros,carregar,acoes,root=document}){
 const node=(tag,text,parent)=>{const el=root.createElement(tag);if(text!=null)el.textContent=text;parent?.append(el);return el;};
 const botao=(text,parent,fn)=>{const b=node('button',text,parent);b.type='button';b.style.minHeight='44px';b.addEventListener('click',async()=>{try{await fn();}catch{status.textContent='Não foi possível abrir esta ação. Atualize a central e tente novamente.';}});return b;};
 node('h3','📌 Central de pendências',host);
 node('p','Confira o que precisa da sua atenção. Informar um pagamento não confirma o recebimento.',host);
 const status=node('p','Carregando pendências…',host);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const atualizar=botao('Atualizar pendências',host,refresh);
 let mostrarDispensados=false,todos=null;
 const alternar=botao('Ver dispensados',host,()=>{mostrarDispensados=!mostrarDispensados;render();});
 const modo=node('p','',host);
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
   botaoDispensa('cadastros',u,card);
  }
 }
 busca.addEventListener('input',renderCadastros);
 function botaoDispensa(tipo,row,parent){
  const b=botao(mostrarDispensados?'Restaurar aviso':'Dispensar aviso',parent,async()=>{
   if(b.disabled)return;
   const restaurar=mostrarDispensados;
   if(!globalThis.confirm(restaurar?'Restaurar este aviso na central?':'Dispensar este aviso? Os dados serão mantidos. Nenhuma mensagem será marcada como enviada.'))return;
   b.disabled=true;
   try{await acoes.dispensar(tipo,row,restaurar);await refresh();}catch(e){status.textContent=e.message||'Não foi possível alterar o aviso.';b.disabled=false;}
  });
 }
 function grupo(tipo,titulo,rows,label,action){
  const card=node('section',null,body);card.style.cssText='padding:14px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fff);overflow-wrap:anywhere';
  node('h4',`${titulo} · ${rows.length}`,card);
  if(!rows.length){node('p','Nenhuma pendência.',card);return;}
  const details=node('details',null,card);node('summary','Ver pendências',details);
  for(const row of rows){const item=node('div',null,details);item.style.cssText='padding:10px 0;border-bottom:1px solid var(--border,#ddd)';node('strong',row.nome,item);if(row.parcela)node('p','Parcela '+row.parcela,item);if(typeof row.data==='string')node('p','Data combinada: '+row.data.split('-').reverse().join('/'),item);if(row.motivo)node('p',row.motivo,item);botao(label,item,()=>action(row));botaoDispensa(tipo,row,item);}
 }
 function render(){
  if(!todos)return;
  const n=Object.values(todos).flat().filter(r=>r.dispensado).length;
  alternar.textContent=mostrarDispensados?'Voltar às pendências':`Ver dispensados (${n})`;
  modo.textContent=mostrarDispensados?'Exibindo avisos dispensados que ainda correspondem aos dados atuais. Você pode restaurá-los.':'Exibindo pendências ativas. Dispensar oculta somente este aviso.';
  dados=Object.fromEntries(Object.entries(todos).map(([k,rows])=>[k,rows.filter(r=>r.dispensado===mostrarDispensados)]));body.replaceChildren();
   grupo('contas','🆕 Contas para aprovar',dados.contas,'Ver aprovação',acoes.contas);
   grupo('pedidos','📥 Pedidos de empréstimo',dados.pedidos,'Abrir pedidos',acoes.pedidos);
   grupo('pagamentos','💳 Pagamentos para conferir',dados.pagamentos,'Conferir parcelas',acoes.parcelas);
   const avisos=node('section',null,body);avisos.style.cssText='padding:14px;border:2px solid #15803d;border-radius:12px;background:var(--surface,#fff);overflow-wrap:anywhere';
   node('h4',`✅ Pagamentos confirmados — falta avisar · ${dados.avisos.length}`,avisos);
   node('p','Abrir o WhatsApp não confirma envio. Depois de enviar, marque como avisado. Inclui a última parcela e pagamentos parciais.',avisos);
   if(!dados.avisos.length)node('p','Nenhum aviso pendente. Novos recebimentos confirmados aparecem aqui.',avisos);
   for(const row of dados.avisos){
    const item=node('div',null,avisos);item.style.cssText='padding:10px 0;border-bottom:1px solid var(--border,#ddd)';
    node('strong',row.nome,item);node('p','Parcela '+row.parcela,item);
    node('p','Recebido: '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:row.pais==='PT'?'EUR':'BRL'}).format(Number(row.valorRecebido)),item);
    if(typeof row.data==='string')node('p','Pagamento em '+row.data.split('-').reverse().join('/'),item);
    botaoDispensa('avisos',row,item);
    if(mostrarDispensados)continue;
    botao('💬 Enviar confirmação pelo WhatsApp',item,()=>acoes.avisarRecebimento(row));
    const marcar=botao('✅ Marcar como avisado',item,async()=>{
     if(marcar.disabled)return;
     if(!globalThis.confirm('Você já enviou a confirmação deste recebimento ao cliente?'))return;
     marcar.disabled=true;
     try{await acoes.marcarRecebimento(row);await refresh();}
     catch(e){status.textContent=e.message||'Não foi possível marcar o aviso. Tente novamente.';marcar.disabled=false;}
    });
   }
   grupo('vencidas','🗓️ Promessas vencidas',dados.vencidas,'Revisar promessa',acoes.parcelas);
   grupo('conferir','⚠️ Promessas a conferir',dados.conferir,'Ver detalhes',r=>r.emprestimoId?acoes.parcelas(r):acoes.cliente(r));
   renderCadastros();
 }
 async function refresh(){
  atualizar.disabled=true;host.setAttribute('aria-busy','true');status.textContent='Consultando dados atuais…';
  try{
   const raw=await carregar();todos=aplicarDispensas(resumirPendencias(raw),raw.dispensas||[]);render();status.textContent='Atualizado às '+new Date().toLocaleTimeString('pt-PT')+'. Use Atualizar pendências após resolver uma situação.';
  }catch{
   status.textContent='Não foi possível atualizar as pendências. Tente novamente. Os números anteriores, se visíveis, podem estar desatualizados.';
   cadastroStatus.textContent='Não foi possível atualizar os cadastros. Tente novamente na central de pendências.';
  }finally{atualizar.disabled=false;host.setAttribute('aria-busy','false');}
 }
 refresh();return {refresh};
}
