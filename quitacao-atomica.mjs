import {previaMoedas} from './previa-moedas.mjs';
// Todas as leituras acontecem antes de qualquer escrita da transação.
export async function prepararQuitacaoAtomica(api,tx,parcel,loan,preview,operationId){
 const uid=parcel.userId||loan.userId;
 if(!uid||loan.userId&&loan.userId!==uid)throw Error('Vínculo do cliente inválido. Nenhum pagamento foi salvo.');
 const userRef=api.doc(api.db,'usuarios',uid),userSnap=await tx.get(userRef);
 if(!userSnap.exists())throw Error('Cliente não encontrado. Nenhum pagamento foi salvo.');
 const user=userSnap.data(),total=Number(loan.parcelas),pagas=Number(loan.parcelasPagas||0);
 if(!Number.isInteger(total)||total<=0||!Number.isInteger(pagas)||pagas<0||pagas>=total)throw Error('Confira a contagem de parcelas do empréstimo antes de confirmar.');
 const partes=preview.dataReal.split('-').map(Number),dataReal=new Date(partes[0],partes[1]-1,partes[2],12);
 const moedas=previaMoedas(parcel,loan,user,dataReal);
 if(!moedas)throw Error('Não foi possível calcular as moedas. Nenhum pagamento foi salvo.');
 const saldo=Number(user.isaCoins||0);
 if(!Number.isSafeInteger(saldo)||saldo<0||!Number.isSafeInteger(saldo+moedas.total))throw Error('Saldo de moedas inválido. Confira o cadastro.');
 let indicadorRef,indicador;
 if(moedas.indicacao){
  if(user.indicadoPor===uid)throw Error('Indicação inválida. Confira o cadastro.');
  indicadorRef=api.doc(api.db,'usuarios',user.indicadoPor);const snap=await tx.get(indicadorRef);
  if(!snap.exists())throw Error('Indicador não encontrado. Nenhum pagamento foi salvo.');
  indicador=snap.data();if(!Number.isSafeInteger(Number(indicador.isaCoins||0)+5000))throw Error('Saldo do indicador inválido.');
 }
 const finalizado=pagas+1>=total;
 return {moedas,finalizado,aplicar(){
  const inicio=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  const vencimento=parcel.vencimento?.toDate?.()||new Date(parcel.vencimento);
  const adiantado=inicio(dataReal)<inicio(vencimento);
  tx.update(userRef,{isaCoins:saldo+moedas.total,pagamentosAdiantados:Number(user.pagamentosAdiantados||0)+(adiantado?1:0),...(moedas.indicacao?{indicacaoPremiada:true}:{})});
  if(indicadorRef)tx.update(indicadorRef,{isaCoins:Number(indicador.isaCoins||0)+5000});
  tx.update(api.doc(api.db,'emprestimos',parcel.emprestimoId),{parcelasPagas:pagas+1,finalizado,status:finalizado?'finalizado':'ativo'});
  const notificar=(id,userId,titulo,mensagem)=>tx.set(api.doc(api.db,'notificacoes',id),{userId,titulo,mensagem,lida:false,data:api.serverTimestamp()});
  const moeda=loan.pais==='PT'?'€':'R$';
  notificar('pagamento_'+operationId,uid,'✅ Pagamento confirmado',`Parcela ${parcel.numero} de ${total} confirmada. Recebido agora: ${moeda} ${Number(preview.recebido).toFixed(2)}. Creditadas ${moedas.total} ISAcoins.`);
  if(indicadorRef)notificar('indicacao_'+operationId,user.indicadoPor,'🎉 Indicação premiada!','Quem você indicou quitou o primeiro empréstimo. Você ganhou 5.000 IsaCoins!');
  if(finalizado){const nomes=String(user.nome||'Um cliente').trim().split(/\s+/);const nome=nomes.length>1?nomes[0]+' '+nomes.at(-1)[0].toUpperCase()+'.':nomes[0];tx.set(api.doc(api.db,'atividadesQuitacao',operationId),{userId:uid,nomeExibicao:nome,isaCoinsGanhos:moedas.total,criadoEm:api.serverTimestamp()});}
 }};
}
