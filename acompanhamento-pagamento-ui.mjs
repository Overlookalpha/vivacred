import {prepararWhatsAppParcela} from './mensagem-cobranca-whatsapp.mjs';
import {noticeKey,noticeState,projection,saveNotice,displayDate} from './acompanhamento-pagamento.mjs';
import {dateKey} from './vencimentos.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createPaymentFollowup(api){
 let notices=new Map(),loadError=false,dialog=null;
 const money=(value,loan)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:loan.pais==='PT'?'EUR':'BRL'}).format(value);
 async function refresh(){try{const snap=await api.getDocsFromServer(api.collection(api.db,'promessasPagamento'));notices=new Map(snap.docs.map(s=>[s.id,s.data()]));loadError=false;}catch{loadError=true;} }
 function keys(id,loan){return [...(loan.userId?[noticeKey('cliente',loan.userId)]:[]),noticeKey('parcela',id)];}
 function cardHTML(id,parcel,loan){
  if(!id)return '';
  const found=keys(id,loan).map(k=>notices.get(k)).filter(n=>n?.status==='ativa');
  const labels=found.map(n=>{const state=noticeState(n,api.now?.()||new Date());
   let forecast='';
   if(!state.invalid&&!state.expired){
    try{
     const reference=api.now?.()||new Date();
     const estimate=projection(parcel,loan,n.data,api.calculate,reference);
     const current=api.calculate(parcel,reference);
     const extra=Math.max(0,Number((estimate.juros-current.juros).toFixed(2)));
     forecast=`<div style="margin-top:10px;line-height:1.7"><strong>Estimativa para ${esc(displayDate(n.data))}</strong><br>Juros totais até a data: <strong>${esc(money(estimate.juros,loan))}</strong><br>Juros adicionais de hoje até a data: ${esc(money(extra,loan))}<br>Multa: ${esc(money(estimate.multa,loan))}<br><strong>Total estimado para pagar: ${esc(money(estimate.totalAtualizado,loan))}</strong><br><small>Calculado com os dados atuais, sem novos pagamentos. O vencimento original permanece.</small></div>`;
    }catch{forecast='<p>Não foi possível calcular a estimativa desta parcela. Confira os dados antes de informar o valor ao cliente.</p>';}
   }
   return `<div style="padding:10px;margin:8px 0;border-radius:8px;background:${state.active?'#fff7ed':'#fef2f2'};color:#7c2d12;border:1px solid #fed7aa"><strong>${esc(state.label)}</strong><br><small>${n.scope==='cliente'?'Aviso para as cobranças deste cliente':'Aviso desta parcela'}${n.observacao?' · '+esc(n.observacao):''}</small>${forecast}</div>`;}).join('');
  return `<div data-acompanhamento-pagamento style="margin:10px 0">${loadError?'<p role="alert">Não foi possível consultar os avisos. Confira antes de cobrar.</p>':labels}<button type="button" data-estimar-parcela="${esc(id)}" style="background:#0369a1;color:white;margin:4px">📅 Estimar para outra data</button><button type="button" data-promessa-parcela="${esc(id)}" style="background:#b45309;color:white;margin:4px">🗓️ ${found.length?'Ver / editar promessa':'Registrar promessa de pagamento'}</button></div>`;
 }
 async function load(id){
  const p=await api.getDocFromServer(api.doc(api.db,'parcelas',id));if(!p.exists())throw Error('Parcela não encontrada.');
  const parcel=p.data();const l=await api.getDocFromServer(api.doc(api.db,'emprestimos',parcel.emprestimoId));if(!l.exists())throw Error('Empréstimo não encontrado.');
  return {parcelId:id,parcel,loan:l.data()};
 }
 async function canContact(id){
  try{
   const {parcel,loan}=await load(id);
   if(['pago','perdido','cancelado'].includes(parcel.status)||loan.finalizado||['quitado','finalizado','cancelado','rejeitado'].includes(loan.status)){alert('Esta parcela ou empréstimo está encerrado. Confira antes de cobrar.');return false;}
   for(const key of keys(id,loan)){
    const snap=await api.getDocFromServer(api.doc(api.db,'promessasPagamento',key));
    if(snap.exists()){
     const state=noticeState(snap.data());
     if(state.active){alert(state.label+'\n\nO contato de cobrança está pausado. Para mudar o combinado, edite ou cancele o aviso no dashboard.');return false;}
    }
   }
   return true;
  }catch{alert('Não foi possível conferir os avisos atualizados. Nenhum contato de cobrança foi aberto.');return false;}
 }
 async function openContact(id){
  // Open during the click so mobile browsers do not block the async navigation.
  const popup=window.open('about:blank','_blank');
  if(!popup){alert('Permita abrir o WhatsApp nas configurações de pop-ups do navegador.');return false;}
  popup.opener=null;
  try{
   if(!await canContact(id)){popup.close();return false;}
   const {parcel,loan}=await load(id);
   const prepared=prepararWhatsAppParcela(parcel,loan,api.now?.()||new Date());
   popup.location.replace(prepared.url);
   return true;
  }catch(e){popup.close();alert(e.message||'Não foi possível preparar a mensagem. Nenhuma mensagem foi enviada.');return false;}
 }
 function node(tag,text,parent){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(parent)parent.append(e);return e;}
 function field(parent,label,type){const wrap=node('label',label,parent);wrap.style.cssText='display:block;margin:12px 0';const e=node(type==='textarea'?'textarea':'input',null,wrap);if(type!=='textarea')e.type=type;e.style.cssText='display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #cbd5e1;border-radius:8px';return e;}
 async function open(id,mode){
  if(dialog)return;
  const d=node('dialog');dialog=d;d.setAttribute('aria-label',mode==='estimate'?'Estimativa de pagamento':'Promessa de pagamento');d.style.cssText='width:min(650px,94vw);max-height:90vh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:14px;background:var(--surface,#fff);color:var(--text,#111)';
  node('h2',mode==='estimate'?'Estimar pagamento em outra data':'Registrar promessa de pagamento',d);
  const status=node('p','Consultando dados atuais…',d);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const body=node('div',null,d),close=node('button','Fechar',d);close.type='button';let saving=false;
  function dismiss(){if(saving)return;d.close();d.remove();dialog=null;}
  close.onclick=dismiss;d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});document.body.append(d);d.showModal();
  try{
   const expected=await load(id),{parcel,loan}=expected;
   if(parcel.teste||parcel.tipoRegistro==='teste'||loan.teste||loan.tipoRegistro==='teste')throw Error('Registro de teste não disponível para este acompanhamento.');
   const actor=api.auth.currentUser?.uid;if(!actor)throw Error('Entre novamente como administrador.');
   const today=dateKey(new Date(),loan.pais||'BR');
   node('p',(loan.nomeCliente||'Cliente')+' · Parcela '+(parcel.numero||'—'),body);
   if(mode==='estimate'){
    node('p','Prévia com os valores e regras já registrados. Não altera saldo, vencimento, pagamento ou acordo. Considera que não haverá novos pagamentos até a data escolhida.',body);
    const date=field(body,'Data prevista de pagamento','date');date.min=today;date.value=today;
    const preview=node('div',null,body),copy=node('button','Copiar estimativa',body);copy.type='button';let message='';
    function render(){preview.replaceChildren();copy.disabled=true;message='';try{
     const result=projection(parcel,loan,date.value,api.calculate);
     const lines=[['Data',displayDate(result.date)],['Valor original',money(result.valorOriginal,loan)],['Já pago',money(result.valorPago,loan)],['Dias de atraso na data',String(result.diasAtraso)],['Multa',money(result.multa,loan)],['Juros',money(result.juros,loan)],['Total estimado',money(result.totalAtualizado,loan)]];
     for(const [label,value] of lines)node('p',label+': '+value,preview);
     message='Estimativa para '+displayDate(result.date)+' — parcela '+(parcel.numero||'—')+': '+money(result.totalAtualizado,loan)+'. Multa: '+money(result.multa,loan)+'; juros: '+money(result.juros,loan)+'. Considera os dados atuais e nenhum novo pagamento até essa data. Não é quitação nem alteração do vencimento.';
     if(parcel.acordoSemEncargos)node('p','Acordo sem multa e juros já registrado nesta parcela foi respeitado.',preview);
     copy.disabled=false;status.textContent='Estimativa gerada. Confira os dados antes de informar ao cliente.';
    }catch(e){status.textContent=e.message;}}
    date.onchange=render;render();
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(message);status.textContent='Estimativa copiada. Nenhuma mensagem foi enviada.';}catch{const text=field(body,'Texto para copiar manualmente','textarea');text.value=message;text.readOnly=true;text.select();}};
   }else{
    node('p','É um aviso de contato: não altera a dívida nem interrompe juros. O prazo inclui o fim da data informada. A partir do dia seguinte, o aviso aparece como vencido e o contato volta a ficar disponível; nenhuma mensagem é enviada automaticamente.',body);
    const label=node('label','Aplicar a',body),scope=node('select',null,label);scope.style.cssText='display:block;padding:10px;margin:6px 0;width:100%';
    const option=node('option','Somente esta parcela',scope);option.value='parcela';
    const original=new Map();for(const kind of loan.userId?['cliente','parcela']:['parcela']){const s=await api.getDocFromServer(api.doc(api.db,'promessasPagamento',noticeKey(kind,kind==='cliente'?loan.userId:id)));original.set(kind,s.exists()?s.data():null);}
    if(original.get('cliente')?.status==='ativa'){const old=node('option','Aviso antigo do cliente — apenas cancelar',scope);old.value='cliente';}
    const date=field(body,'Cliente informou que vai pagar em','date');date.min=today;
    const note=field(body,'Observação do combinado (opcional)','textarea');note.maxLength=500;
    const detail=node('p',null,body),save=node('button','Salvar aviso',body),cancel=node('button','Cancelar aviso existente',body);save.type=cancel.type='button';cancel.style.marginLeft='8px';
    function show(){save.disabled=scope.value!=='parcela';const value=original.get(scope.value);date.value=value?.data||today;note.value=value?.observacao||'';cancel.disabled=value?.status!=='ativa';detail.textContent=value?.status==='ativa'?noticeState(value).label:'Nenhum aviso ativo nesta opção.';}
    scope.onchange=show;show();status.textContent='Confira a data e o alcance do aviso antes de salvar.';
    async function persist(state){
     if(saving)return;if(state==='ativa'&&scope.value!=='parcela'){status.textContent='Registre a promessa somente para a parcela escolhida.';return;}saving=true;save.disabled=cancel.disabled=scope.disabled=date.disabled=note.disabled=close.disabled=true;
     try{await saveNotice(api,{...expected,notice:original.get(scope.value)},{scope:scope.value,status:state,data:date.value,observacao:note.value},actor,crypto.randomUUID());await refresh();await api.refresh();saving=false;dismiss();}
     catch(e){status.textContent=e.message;saving=false;save.disabled=scope.disabled=date.disabled=note.disabled=close.disabled=false;cancel.disabled=original.get(scope.value)?.status!=='ativa';save.disabled=scope.value!=='parcela';}
    }
    save.onclick=()=>void persist('ativa');cancel.onclick=()=>{if(confirm('Cancelar este aviso e liberar os contatos de cobrança abrangidos por ele?'))void persist('cancelada');};
   }
  }catch(e){status.textContent=e.message;}
 }
 document.addEventListener('click',event=>{
  const target=event.target.closest?.('[data-estimar-parcela],[data-promessa-parcela],[data-contato-parcela]');if(!target)return;
  event.preventDefault();
  if(target.dataset.contatoParcela){event.stopImmediatePropagation();const id=target.dataset.contatoParcela;void openContact(id);}
  else void open(target.dataset.estimarParcela||target.dataset.promessaParcela,target.dataset.estimarParcela?'estimate':'promise');
 },true);
 return {refresh,cardHTML,canContact,openContact,open};
}
