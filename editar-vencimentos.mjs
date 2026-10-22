import {canEdit,dateKey,displayDate,makePlan,savePlan} from './vencimentos.mjs';

export function createDateEditor(api) {
  let dialog=null;
  function node(tag,text,parent) {
    const el=document.createElement(tag);
    if (text!==undefined) el.textContent=text;
    if (parent) parent.append(el);
    return el;
  }
  function field(parent,label,type) {
    const wrap=node('label',undefined,parent);wrap.style.display='block';wrap.style.margin='12px 0';
    node('span',label,wrap);const el=node(type==='textarea'?'textarea':'input',undefined,wrap);
    if(type!=='textarea') el.type=type;
    el.style.cssText='display:block;width:100%;box-sizing:border-box;padding:10px;margin-top:5px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111)';
    return el;
  }
  async function open(loanId,parcelId=null) {
    if (dialog) return;
    const actor=api.auth.currentUser?.uid;
    if (!actor) {alert('Entre novamente como administrador.');return;}
    const d=document.createElement('dialog');dialog=d;
    d.style.cssText='width:min(640px,92vw);max-height:88vh;box-sizing:border-box;border:1px solid var(--border,#ddd);border-radius:14px;padding:24px;background:var(--surface,#fff);color:var(--text,#111);overflow:auto';
    d.setAttribute('aria-labelledby','tituloEditarVencimentos');
    const title=node('h2','Editar vencimentos',d);title.id='tituloEditarVencimentos';
    node('p','Somente parcelas futuras sem pagamentos e sem acordo ativo. Valores e pagamentos permanecem iguais.',d);
    const status=node('p','Carregando dados atuais…',d);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const body=node('div',undefined,d),footer=node('div',undefined,d);
    const close=node('button','Cancelar',footer);close.type='button';
    let saving=false;
    function dismiss() {if (!saving) {d.close();d.remove();dialog=null;}}
    close.addEventListener('click',dismiss);d.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    document.body.append(d);d.showModal();
    try {
      const loanSnap=await api.getDocFromServer(api.doc(api.db,'emprestimos',loanId));
      if (!loanSnap.exists()) throw Error('Empréstimo não encontrado.');
      const loan=loanSnap.data();
      const snapshot=await api.getDocsFromServer(api.query(api.collection(api.db,'parcelas'),api.where('emprestimoId','==',loanId)));
      const expected={loan,rows:snapshot.docs.map(s=>({id:s.id,data:s.data()}))};
      const rows=expected.rows.map(r=>({...r.data,id:r.id})).sort((a,b)=>Number(a.numero)-Number(b.numero));
      const eligible=rows.filter(r=>canEdit(r,dateKey(new Date(),loan.pais),loan.pais));
      if (!eligible.length) throw Error('Não há parcelas futuras sem pagamento disponíveis para edição.');
      node('p','Cliente: '+(loan.nomeCliente||'Cliente cadastrado'),body);
      const modeWrap=node('label','Tipo de edição ',body),mode=node('select',undefined,modeWrap);
      for(const [value,text] of [['single','Uma parcela'],['day','Dia de todas as parcelas futuras']]) {const o=node('option',text,mode);o.value=value;}
      mode.value=parcelId?'single':'day';mode.setAttribute('aria-label','Tipo de edição');
      const single=node('div',undefined,body),choiceLabel=node('label','Parcela ',single),choice=node('select',undefined,choiceLabel);
      choice.setAttribute('aria-label','Parcela');
      for(const r of eligible) {const o=node('option',`Parcela ${r.numero} — ${displayDate(dateKey(r.vencimento,loan.pais))}`,choice);o.value=r.id;}
      if (parcelId) {if(!eligible.some(r=>r.id===parcelId)) throw Error('Esta parcela não pode mais ser editada.');choice.value=parcelId;}
      const date=field(single,'Novo vencimento','date');
      const bulk=node('div',undefined,body),day=field(bulk,'Novo dia de vencimento (1 a 31)','number');day.min='1';day.max='31';day.step='1';
      node('p','O mês de cada parcela é mantido. Se o mês não tiver o dia escolhido, será usado o último dia desse mês. A prévia mostra todos os ajustes.',bulk);
      const reason=field(body,'Motivo da alteração (obrigatório)','textarea');reason.maxLength=500;reason.rows=2;
      const previewButton=node('button','Gerar prévia',body);previewButton.type='button';
      const preview=node('div',undefined,body);preview.setAttribute('aria-live','polite');
      const confirmation=node('label',undefined,body);confirmation.style.cssText='display:block;margin:16px 0';
      const agreed=node('input',undefined,confirmation);agreed.type='checkbox';agreed.disabled=true;
      node('span',' Conferi as datas acima e autorizo esta alteração.',confirmation);
      const save=node('button','Salvar alteração de vencimento',footer);save.type='button';save.disabled=true;
      let plan=null;const operationId=crypto.randomUUID();
      function invalidate() {plan=null;preview.replaceChildren();agreed.checked=false;agreed.disabled=true;save.disabled=true;}
      function syncMode() {
        single.hidden=mode.value!=='single';bulk.hidden=mode.value!=='day';
        const row=eligible.find(r=>r.id===choice.value);date.value=dateKey(row.vencimento,loan.pais);day.value=String(Number(date.value.slice(-2)));
        invalidate();
      }
      mode.addEventListener('change',syncMode);choice.addEventListener('change',syncMode);
      for(const el of [date,day,reason]) el.addEventListener('input',invalidate);
      agreed.addEventListener('change',()=>{save.disabled=!plan||!agreed.checked||saving;});
      previewButton.addEventListener('click',()=>{
        invalidate();
        try {
          if (!reason.value.trim()) throw Error('Informe o motivo da alteração.');
          plan=makePlan(rows,loan,{loanId,mode:mode.value,...(mode.value==='single'?{parcelId:choice.value,date:date.value}:{day:Number(day.value)})});
          node('h3','Confira antes de salvar',preview);
          const table=node('table',undefined,preview);table.style.cssText='width:100%;text-align:left;border-collapse:collapse';
          const head=node('tr',undefined,node('thead',undefined,table));for(const text of ['Parcela','Data atual','Nova data'])node('th',text,head);
          const tbody=node('tbody',undefined,table);
          for(const c of plan.changes) {const tr=node('tr',undefined,tbody);node('td',String(c.number),tr);node('td',displayDate(c.before),tr);node('td',displayDate(c.after)+(c.adjusted?' (último dia do mês)':''),tr);}
          node('p',`${plan.changes.length} parcela(s) serão alteradas. ${plan.skipped} parcela(s) fora desta seleção.`,preview);
          node('p','Motivo: '+reason.value.trim(),preview);
          status.textContent='Confira a prévia. Nenhuma alteração foi salva.';agreed.disabled=false;
        } catch(e) {status.textContent=e.message;plan=null;}
      });
      save.addEventListener('click',async()=>{
        if (!plan||!agreed.checked||saving) return;
        if (api.auth.currentUser?.uid!==actor) {status.textContent='A sessão mudou. Reabra a edição.';return;}
        saving=true;save.disabled=true;close.disabled=true;previewButton.disabled=true;
        for(const el of [mode,choice,date,day,reason,agreed]) el.disabled=true;
        status.textContent='Revalidando e salvando…';
        try {
          const count=await savePlan(api,expected,plan,actor,reason.value,operationId);
          status.textContent=`${count} vencimento(s) atualizado(s). Valores e pagamentos preservados.`;
          close.textContent='Fechar';
          try {await api.refresh(loanId);} catch {status.textContent+=' Reabra Gerenciar Parcelas para atualizar a exibição.';}
        } catch(e) {
          status.textContent='A alteração não foi confirmada: '+e.message+' Feche e reabra as parcelas para conferir antes de tentar novamente.';
        } finally {saving=false;close.disabled=false;}
      });
      syncMode();status.textContent='Escolha as novas datas e gere a prévia.';
    } catch(e) {status.textContent=e.message;}
  }
  return {open};
}
