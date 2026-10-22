// Date-only rescheduling. No amounts, payment state or loan terms are written.
export function zone(country) { return country === 'PT' ? 'Europe/Lisbon' : 'America/Sao_Paulo'; }
export function dateKey(value, country='BR') {
  const date = value?.toDate ? value.toDate() : value;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw Error('Vencimento inválido.');
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zone(country),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get = key => parts.find(p=>p.type===key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw Error('Informe uma data válida.');
  const d = new Date(key+'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==key || +key.slice(0,4)<2000 || +key.slice(0,4)>2100) throw Error('Informe uma data válida entre 2000 e 2100.');
  return d;
}
export const displayDate = key => key.split('-').reverse().join('/');
export function canEdit(row, today, country='BR') {
  try {
    return Number.isFinite(Number(row.valor)) && Number(row.valor)>0 &&
      Number(row.pago ?? 0)===0 && !row.acordoAtivo &&
      !['pago','perdido','cancelado','finalizado'].includes(String(row.status||'').toLowerCase()) &&
      dateKey(row.vencimento,country)>today;
  } catch { return false; }
}
export function signature(value) {
  function clean(v) {
    if (v?.toMillis) return {$timestamp:v.toMillis()};
    if (v instanceof Date) return {$timestamp:v.getTime()};
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,clean(v[k])]));
    return v;
  }
  return JSON.stringify(clean(value));
}
export function makePlan(rows, loan, options, now=new Date()) {
  if (!loan || loan.finalizado || ['finalizado','rejeitado','cancelado','quitado'].includes(loan.status)) throw Error('Este empréstimo está encerrado.');
  if (!Array.isArray(rows) || !rows.length || rows.length>100) throw Error('A edição aceita de 1 a 100 parcelas por empréstimo.');
  const today=dateKey(now,loan.pais), country=loan.pais||'BR';
  if (new Set(rows.map(r=>r.id)).size!==rows.length || rows.some(r=>!r.id || r.emprestimoId!==options.loanId || (loan.userId && r.userId!==loan.userId))) throw Error('Vínculo das parcelas não confirmado.');
  const ordered=[...rows].sort((a,b)=>Number(a.numero)-Number(b.numero));
  if (ordered.some(r=>!Number.isInteger(Number(r.numero)) || Number(r.numero)<1) || new Set(ordered.map(r=>Number(r.numero))).size!==rows.length) throw Error('Numeração de parcelas inconsistente.');
  const eligible=ordered.filter(r=>canEdit(r,today,country));
  let selected;
  if (options.mode==='single') {
    selected=eligible.filter(r=>r.id===options.parcelId);
    if (selected.length!==1) throw Error('Só é possível editar uma parcela futura, sem pagamento e sem acordo ativo.');
    parseDate(options.date);
  } else if (options.mode==='day') {
    if (!Number.isInteger(options.day) || options.day<1 || options.day>31) throw Error('Escolha um dia entre 1 e 31.');
    selected=eligible;
  } else throw Error('Tipo de edição inválido.');
  if (!selected.length) throw Error('Não há parcelas futuras elegíveis.');
  const changes=[];
  for (const r of selected) {
    const before=dateKey(r.vencimento,country);
    let after=options.date, adjusted=false;
    if (options.mode==='day') {
      const [year,month]=before.split('-').map(Number);
      const last=new Date(Date.UTC(year,month,0)).getUTCDate();
      const day=Math.min(options.day,last);adjusted=day!==options.day;
      after=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
    parseDate(after);
    if (after<=today) throw Error('A nova data precisa ser futura. Escolha outro dia ou edite a parcela individualmente.');
    if (before!==after) changes.push({id:r.id,number:r.numero,before,after,adjusted});
  }
  if (!changes.length) throw Error('As datas escolhidas já são as atuais; nenhuma alteração necessária.');
  const changed=new Map(changes.map(c=>[c.id,c]));
  for (let i=1;i<ordered.length;i++) {
    const previous=ordered[i-1],current=ordered[i];
    if (!changed.has(previous.id) && !changed.has(current.id)) continue;
    const a=changed.get(previous.id)?.after||dateKey(previous.vencimento,country);
    const b=changed.get(current.id)?.after||dateKey(current.vencimento,country);
    if (a>=b) throw Error('Os vencimentos precisam manter a ordem das parcelas, sem datas iguais.');
  }
  return {loanId:options.loanId,mode:options.mode,changes,skipped:rows.length-selected.length,options:{...options},country};
}
export async function savePlan(api, expected, plan, actor, reason, operationId, now=()=>new Date()) {
  if (!actor || typeof reason!=='string' || !reason.trim() || reason.trim().length>500) throw Error('Informe o motivo da alteração (até 500 caracteres).');
  const {doc,db}=api;
  const audit=doc(db,'alteracoesVencimento',operationId);
  return api.runTransaction(db,async tx=>{
    // Every read precedes every write. A concurrent payment cancels the preview.
    const admin=await tx.get(doc(db,'admins',actor));
    const loan=await tx.get(doc(db,'emprestimos',plan.loanId));
    const prior=await tx.get(audit);
    const snapshots=[];
    for (const row of expected.rows) snapshots.push(await tx.get(doc(db,'parcelas',row.id)));
    if (!admin.exists()) throw Error('Acesso administrativo necessário.');
    if (prior.exists()) throw Error('Esta alteração já foi registrada. Reabra as parcelas para conferir.');
    if (!loan.exists() || signature(loan.data())!==signature(expected.loan)) throw Error('O empréstimo mudou. Feche e abra novamente a edição.');
    const fresh=snapshots.map((snap,i)=>{
      const original=expected.rows[i];
      if (!snap.exists() || signature(snap.data())!==signature(original.data)) throw Error('Uma parcela mudou ou recebeu pagamento. Reabra a edição e confira os dados.');
      return {...snap.data(),id:original.id};
    });
    const checked=makePlan(fresh,loan.data(),plan.options,now());
    if (signature(checked)!==signature(plan)) throw Error('A prévia mudou. Gere uma nova prévia antes de salvar.');
    for (const change of checked.changes) {
      tx.update(doc(db,'parcelas',change.id),{
        vencimento:parseDate(change.after),
        ultimaAlteracaoVencimento:{operacaoId:operationId,por:actor,em:api.serverTimestamp()}
      });
    }
    tx.set(audit,{emprestimoId:plan.loanId,userId:loan.data().userId||null,tipo:plan.mode,motivo:reason.trim(),por:actor,em:api.serverTimestamp(),alteracoes:checked.changes.map(c=>({parcelaId:c.id,numero:c.number,antes:c.before,depois:c.after}))});
    return checked.changes.length;
  });
}
