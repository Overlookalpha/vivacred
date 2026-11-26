import {displayDate} from './vencimentos.mjs';
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
