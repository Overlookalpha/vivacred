// Regra pura compartilhada: sem gravações, sem alterações nos contratos existentes.
const DAY = 86400000;
const real = p => p.dataPagamentoReal || p.dataPagamentoEfetivo;
const teste = p => p.teste === true || p.tipoRegistro === 'teste';
function dia(value, pais) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(value+'T12:00:00Z');
    return Number.isNaN(+d) || d.toISOString().slice(0,10)!==value ? null : Math.floor(+d/DAY);
  }
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(+d)) return null;
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:pais==='PT'?'Europe/Lisbon':'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const part = key => parts.find(p=>p.type===key).value;
  return Date.UTC(+part('year'),+part('month')-1,+part('day'))/DAY;
}
export function fatorNota(nota) {
  return nota===null ? 1 : nota>=75 ? 1 : nota>=60 ? .75 : nota>=40 ? .5 : nota>=20 ? .25 : 0;
}
export function recuperarCredito(cliente, contratos, parcelas, agora=new Date()) {
  const pais=cliente.pais==='PT'?'PT':'BR', hoje=dia(agora,pais);
  const itens=parcelas.filter(p=>!teste(p)).map(p=>{
    const valor=Number(p.valor),pago=Number(p.pago||0),vencimento=dia(p.vencimento,pais),pagamento=dia(real(p),pais);
    const quitada=p.status==='pago'||(valor>0&&pago>=valor);
    return {quitada,vencimento,pagamento,perdida:p.status==='perdido',
      atraso:vencimento===null?null:quitada?(pagamento===null||pagamento>hoje?null:Math.max(0,pagamento-vencimento)):Math.max(0,hoje-vencimento),
      saldo:valor>pago};
  });
  const perdas=contratos.some(c=>!teste(c)&&(c.status==='perdido'||c.perdido===true))||itens.some(p=>p.perdida);
  const abertos=itens.filter(p=>!p.quitada&&!p.perdida&&p.saldo&&p.atraso>0);
  const validos=itens.filter(p=>p.atraso!==null&&(p.quitada||p.saldo&&p.atraso>0));
  const maiorAtraso=Math.max(0,...validos.map(p=>p.atraso));
  const reincidencias=validos.filter(p=>p.atraso>3).length;
  let nota=perdas?0:validos.length?(maiorAtraso>60?10:maiorAtraso>30?28:maiorAtraso>10?48:maiorAtraso>3?68:maiorAtraso>0?82:95):null;
  if(nota!==null&&!perdas)nota=Math.max(0,nota-Math.min(15,Math.max(0,reincidencias-1)*5)-(itens.every(p=>!p.quitada)&&maiorAtraso>3?10:0));
  const atrasadas=validos.filter(p=>p.quitada&&p.atraso>0);
  const ultimaRegularizacao=Math.max(-Infinity,...atrasadas.map(p=>p.pagamento));
  let pontosRecuperados=0,pontuaisRecuperacao=0,antecipadasRecuperacao=0;
  // Recuperar só depois do último atraso, sem pendências vencidas nessa data.
  // Pagamentos no mesmo dia da regularização não presumem uma ordem desconhecida.
  if(atrasadas.length&&!perdas) for(const p of validos){
    if(!p.quitada||p.atraso!==0||p.pagamento<=ultimaRegularizacao)continue;
    const pendencia=itens.some(x=>x.saldo&&!x.quitada&&x.vencimento!==null&&x.vencimento<p.pagamento ||
      x.quitada&&x.vencimento!==null&&x.pagamento!==null&&x.vencimento<p.pagamento&&x.pagamento>=p.pagamento);
    if(pendencia)continue;
    if(p.vencimento-p.pagamento>=5){pontosRecuperados+=5;antecipadasRecuperacao++;}
    else {pontosRecuperados+=3;pontuaisRecuperacao++;}
  }
  if(nota!==null&&!perdas)nota=Math.min(100,nota+pontosRecuperados);
  return {nota,fator:fatorNota(nota),perda:perdas,atrasosAtuais:abertos.length,maiorAtraso,
    diasAcumulados:validos.reduce((s,p)=>s+p.atraso,0),pontosRecuperados,pontuaisRecuperacao,antecipadasRecuperacao,
    semDataReal:itens.filter(p=>p.quitada&&(p.pagamento===null||p.pagamento>hoje)).length,
    semVencimento:itens.filter(p=>p.vencimento===null).length};
}
export function limitesRecuperacao(cliente,normal,contratos,parcelas,agora=new Date()){
  const a=recuperarCredito(cliente,contratos,parcelas,agora);
  const manual=cliente.limiteManual===true&&Number(cliente.limiteBase)>0;
  // Limites manuais permanecem sob decisão do admin; perda e pendência exigem regularização.
  const fator=manual?1:a.fator;
  const limiteAvaliado=Math.floor(normal*fator*100)/100;
  const bloqueado=a.perda||a.atrasosAtuais>0||fator===0;
  return {...a,manual,normal,limiteAvaliado,disponivel:bloqueado?0:limiteAvaliado,
    reducaoPercentual:Math.round((1-fator)*100),bloqueado};
}
