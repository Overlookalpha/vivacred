import {displayDate,dateKey,parseDate} from './vencimentos.mjs';
import {calcularCobrancaParcela} from './cobranca-parcela.mjs';
import {previaPagamentoReal,distribuirRecebimentoReal} from './conferencia-pagamento.mjs';
let aberta=false;
export function conferirPagamento(preview,loan,parcel,distribuicao){
 if(aberta)return Promise.resolve(false);aberta=true;
 return new Promise(resolve=>{
  const node=(tag,text,parent)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;parent?.append(e);return e;};
  const d=node('dialog');d.setAttribute('aria-label','Conferir pagamento antes de salvar');d.style.cssText='width:min(650px,94vw);box-sizing:border-box;max-height:90vh;overflow:auto;padding:22px;border:1px solid var(--border,#ccc);border-radius:14px;background:var(--surface,#fff);color:var(--text,#111)';
  const title=node('h2','Conferir pagamento',d);title.tabIndex=-1;
  node('p',(loan.nomeCliente||'Cliente')+' · Parcela '+(parcel.numero||'—')+' · '+(preview.mode==='confirmar'?'Confirmar quitação':'Adicionar pagamento'),d);
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:preview.pais==='PT'?'EUR':'BRL'}).format(v);
  const lines=[['Data real do pagamento',displayDate(preview.dataReal)],['Valor da parcela no contrato/acordo',money(preview.valorParcela)],['Já recebido nesta parcela',money(preview.jaPago)],['Valor recebido AGORA',money(preview.recebido)],['Juros por atraso calculados na data',money(preview.jurosCalculados)],['Multa calculada na data',money(preview.multaCalculada)],['Desconto já registado em acordo',money(preview.descontoAcordo)],['Novo desconto neste lançamento',money(0)],['Saldo contratual após salvar',money(preview.saldoContratual)],['Total atualizado antes deste lançamento',money(preview.totalAtualizado)]];
  const list=node('dl',null,d);for(const [label,value] of lines){node('dt',label,list);const amount=node('dd',value,list);amount.style.cssText='font-weight:700;margin:3px 0 12px';}
  if(preview.semEncargos)node('p','Acordo sem juros e multa já registado foi respeitado.',d);
  node('p','O desconto apresentado é de um acordo existente, não é um novo desconto. Este lançamento mantém a regra atual: regista o valor recebido contra o saldo contratual, sem acrescentar automaticamente encargos por atraso.',d);
  let aviso=null;
  if(preview.encargosFora>0){
   const box=node('section',null,d);box.style.cssText='padding:12px;border:2px solid #b45309;border-radius:10px;margin:12px 0';
   node('strong','Atenção: '+money(preview.encargosFora)+' de juros e multa calculados ficam fora deste lançamento.',box);
   node('p','Se o valor recebido inclui esses encargos, cancele e confira o acordo/valor da parcela antes de continuar. Não é uma discriminação de juros recebidos.',box);
   const label=node('label',null,box);aviso=node('input',null,label);aviso.type='checkbox';aviso.style.cssText='width:auto;min-height:auto;margin-right:8px';node('span','Conferi esta diferença e quero manter este lançamento contratual.',label);
  }
  node('p','Repasse Evelyn: '+money(distribuicao.repasseEvelyn)+' · Entrada líquida no Caixa: '+money(distribuicao.valorLiquido),d);
  if(preview.recebido===0)node('p','Nenhum novo dinheiro será recebido: esta ação apenas confirma o saldo contratual já integralmente registado.',d);
  if(preview.mode==='parcial'&&preview.saldoContratual===0)node('p','O saldo contratual ficará zerado. A confirmação final e as bonificações continuam pelo botão Confirmar.',d);
  const cancel=node('button','Cancelar — não salvar',d),save=node('button','Confirmar e salvar pagamento',d);cancel.type=save.type='button';save.style.marginLeft='8px';save.disabled=!!aviso;
  if(aviso)aviso.onchange=()=>{save.disabled=!aviso.checked;};
  let done=false;function finish(result){if(done)return;done=true;d.close();d.remove();aberta=false;resolve(result);}
  cancel.onclick=()=>finish(false);save.onclick=()=>finish(true);d.addEventListener('cancel',e=>{e.preventDefault();finish(false);});document.body.append(d);d.showModal();title.focus();
 });
}
export function solicitarPagamentoReal(parcel,loan,mode){
 if(aberta)return Promise.resolve(null);aberta=true;
 return new Promise(resolve=>{
  const node=(tag,text,parent)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;parent?.append(e);return e;};
  const d=node('dialog');d.setAttribute('aria-label','Informar e conferir pagamento real');d.style.cssText='width:min(650px,94vw);box-sizing:border-box;max-height:90vh;overflow:auto;padding:22px;border:1px solid var(--border,#ccc);border-radius:14px;background:var(--surface,#fff);color:var(--text,#111)';
  const title=node('h2',mode==='confirmar'?'Confirmar valor realmente recebido':'Registar pagamento parcial',d);title.tabIndex=-1;
  node('p',(loan.nomeCliente||'Cliente')+' · Parcela '+(parcel.numero||'—'),d);
  node('p','Informe o total recebido e os juros e multa que estão incluídos nele. A diferença será abatida do valor da parcela. Não há desconto automático.',d);
  function field(label,type){const wrap=node('label',label,d);wrap.style.cssText='display:block;margin:12px 0;font-weight:600';const input=node('input',null,wrap);input.type=type;input.style.cssText='display:block;box-sizing:border-box;width:100%;min-height:44px;margin-top:6px;padding:10px';if(type==='text')input.inputMode='decimal';return input;}
  const date=field('Data em que o cliente realmente pagou','date');date.max=dateKey(new Date(),loan.pais||'BR');date.value=date.max;
  const total=field('Total recebido agora, incluindo juros e multa','text');total.placeholder='Ex.: 374,50';
  const juros=field('Juros por atraso incluídos no total recebido','text'),multa=field('Multa incluída no total recebido','text');juros.value=multa.value='0,00';
  const fill=node('button','Preencher com o total devido na data',d);fill.type='button';
  node('small','No pagamento parcial, preencha os juros e a multa efetivamente recebidos. Não presuma uma composição sem conferir.',d);
  const status=node('p','Informe os valores para conferir.',d);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const summary=node('section',null,d);summary.style.cssText='padding:12px;border:1px solid var(--border,#ddd);border-radius:10px;margin:12px 0';
  const cancel=node('button','Cancelar — não salvar',d),save=node('button','Confirmar e salvar pagamento',d);cancel.type=save.type='button';save.style.marginLeft='8px';save.disabled=true;
  let preview=null;
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:loan.pais==='PT'?'EUR':'BRL'}).format(v);
  function render(){
   preview=null;save.disabled=true;summary.replaceChildren();
   try{
    const p=previaPagamentoReal(parcel,loan,{valor:total.value,juros:juros.value,multa:multa.value,dataReal:date.value},mode);
    const dist=distribuirRecebimentoReal(p,loan,parcel);
    for(const [label,value] of [['Total efetivamente recebido',p.recebido],['Abatimento da parcela',p.paraParcela],['Juros por atraso recebidos',p.jurosRecebidos],['Multa recebida',p.multaRecebida],['Saldo contratual após salvar',p.saldoContratual],['Juros ainda pendentes na data',p.jurosRestantes],['Multa ainda pendente',p.multaRestante],['Saldo total após salvar na data',p.saldoAtualizado],['Desconto de acordo já existente',p.descontoAcordo],['Novo desconto',0],['Repasse Evelyn',dist.repasseEvelyn],['Entrada líquida no Caixa',dist.valorLiquido]]){
     const line=node('p',label+': ',summary);node('strong',money(value),line);
    }
    node('p','Cobrança antes deste lançamento: '+money(p.totalAtualizado)+' · Data real: '+displayDate(p.dataReal),summary);
    node('small','O total recebido já inclui os juros e a multa acima. Estes valores não serão somados duas vezes. Juros contratuais já incluídos na parcela continuam dentro do abatimento da parcela.',summary);
    if(p.semEncargos)node('p','O acordo sem juros e multa existente foi respeitado.',summary);
    if(p.recebido===0)node('p','Nenhuma nova entrada no Caixa. Apenas confirmação de valores já registados.',summary);
    preview=p;save.disabled=false;status.textContent='Confira os valores antes de confirmar. Nada foi salvo ainda.';
   }catch(e){status.textContent=e.message||'Confira os dados do pagamento.';}
  }
  function sugerir(){try{
   parseDate(date.value);const [y,m,day]=date.value.split('-').map(Number),v=dateKey(parcel.vencimento,loan.pais||'BR').split('-').map(Number);
   const c=calcularCobrancaParcela({...parcel,vencimento:new Date(v[0],v[1]-1,v[2],12)},new Date(y,m-1,day,12));
   total.value=c.totalAtualizado.toFixed(2).replace('.',',');juros.value=c.juros.toFixed(2).replace('.',',');multa.value=c.multa.toFixed(2).replace('.',',');render();
  }catch(e){status.textContent=e.message;save.disabled=true;preview=null;}}
  fill.onclick=sugerir;
  for(const input of [date,total,juros,multa])input.addEventListener('input',render);
  let done=false;function finish(value){if(done)return;done=true;d.close();d.remove();aberta=false;resolve(value);}
  cancel.onclick=()=>finish(null);save.onclick=()=>{if(preview)finish(preview);};d.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  document.body.append(d);d.showModal();if(mode==='confirmar')sugerir();title.focus();
 });
}
