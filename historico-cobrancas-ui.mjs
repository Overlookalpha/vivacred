import {registrarContato,confirmarEnvio,ordenarContatos} from './historico-cobrancas.mjs';
export function criarHistoricoCobrancas(api){
 let dialog=null;
 const node=(tag,text,parent)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;parent?.append(e);return e;};
 const data=value=>{const d=value?.toDate?.();return d?d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Data indisponível';};
 async function abrir(parcelaId){
  if(dialog)return;
  const d=node('dialog');dialog=d;d.setAttribute('aria-label','Histórico de cobranças da parcela');
  d.style.cssText='width:min(650px,94vw);box-sizing:border-box;max-height:90vh;overflow:auto;padding:20px;border:1px solid var(--border,#ccc);border-radius:14px;background:var(--surface,#fff);color:var(--text,#111)';
  node('h2','Histórico de cobranças',d);
  node('p','Abrir o WhatsApp não confirma envio. Depois de enviar a mensagem, marque o contacto correspondente como enviado. As datas abaixo usam o horário deste dispositivo.',d);
  const status=node('p','A consultar os contactos…',d);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const list=node('div',null,d),close=node('button','Fechar',d);close.type='button';
  const dismiss=()=>{d.close();d.remove();dialog=null;};close.onclick=dismiss;
  d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});document.body.append(d);d.showModal();
  async function render(){
   const snap=await api.getDocsFromServer(api.query(api.collection(api.db,'historicoCobrancas'),api.where('parcelaId','==',parcelaId)));
   list.replaceChildren();
   const records=ordenarContatos(snap.docs.map(s=>({...s.data(),id:s.id})));
   status.textContent=records.length?records.length+' contacto(s) registado(s).':'Ainda não há contactos registados. Os novos contactos pelo botão WhatsApp aparecerão aqui; envios antigos não são presumidos.';
   for(const record of records){
    const card=node('section',null,list);card.style.cssText='padding:14px;margin:12px 0;border:1px solid var(--border,#ddd);border-radius:10px';
    node('strong',record.status==='enviada'?'✅ Mensagem marcada como enviada':'📝 Mensagem preparada · envio não confirmado',card);
    node('p','Contacto preparado em: '+data(record.criadoEm),card);
    if(record.enviadoEm)node('p','Envio confirmado por administrador em: '+data(record.enviadoEm),card);
    node('p','Telefone utilizado: '+(record.telefone||'Não informado'),card);
    const details=node('details',null,card);node('summary','Ver mensagem preparada',details);
    const text=node('p',record.mensagem||'Mensagem não disponível.',details);text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
    if(record.status!=='enviada'){
     const mark=node('button','✅ Marcar mensagem como enviada',card);mark.type='button';
     mark.onclick=async()=>{mark.disabled=true;status.textContent='A guardar a confirmação…';try{await confirmarEnvio(api,record.id,parcelaId);await render();status.textContent='Mensagem marcada como enviada. Esta confirmação é manual; não é um comprovativo de entrega ou leitura.';}catch(e){status.textContent=e.message||'Não foi possível guardar. Tente novamente.';mark.disabled=false;}};
    }
   }
  }
  try{await render();}catch(e){status.textContent='Não foi possível consultar o histórico. '+(e.message||'Tente novamente.');}
 }
 document.addEventListener('click',event=>{const target=event.target.closest?.('[data-historico-cobranca]');if(!target)return;event.preventDefault();void abrir(target.dataset.historicoCobranca);});
 return {abrir,registrar:(expected,prepared)=>registrarContato(api,expected,prepared,crypto.randomUUID())};
}
