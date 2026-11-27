import {validarTelefone} from './painel-emprestimos.mjs';
import {emprestimoQuitado} from './confirmacao-pagamento.mjs';
import {registrarContato} from './historico-cobrancas.mjs';
export function prepararAvisoRecebimento(pagamento,loan,parcelas=[]){
 const valor=Number(pagamento.valorRecebido);
 if(!Number.isFinite(valor)||valor<=0||pagamento.avisoClienteStatus!=='pendente')throw Error('Este recebimento não tem aviso pendente. Atualize a central.');
 if(pagamento.emprestimoId!==loan.id||pagamento.userId&&loan.userId&&pagamento.userId!==loan.userId)throw Error('Cliente ou empréstimo do recebimento não corresponde ao cadastro.');
 const telefone=validarTelefone(loan.telefoneCliente,loan.pais||'BR').replace(/\D/g,'');
 const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:pagamento.pais==='PT'?'EUR':'BRL'}).format(Number(v));
 const quitado=emprestimoQuitado(loan,parcelas),linhas=[`Olá, ${loan.nomeCliente||'Cliente'}! ✅ Aqui é a Evellyn, assistente da IsaCred.`,'',`Confirmamos o recebimento referente à parcela nº ${pagamento.numeroParcela||'—'}${loan.parcelas?' de '+loan.parcelas:''}.`,`💰 Valor recebido neste pagamento: ${money(valor)}.`];
 if(pagamento.dataPagamentoReal)linhas.push('📅 Data do pagamento: '+pagamento.dataPagamentoReal.split('-').reverse().join('/'));
 if(pagamento.encargosDiscriminadosNoRecebimento)linhas.push(`Neste recebimento: ${money(pagamento.valorParcelaRecebido||0)} da parcela, ${money(pagamento.jurosRecebidos||0)} de juros por atraso e ${money(pagamento.multaRecebida||0)} de multa.`);
 if(Number(pagamento.saldoDepois)>0)linhas.push(`Saldo contratual desta parcela após este pagamento: ${money(pagamento.saldoDepois)}. Eventuais encargos seguem o combinado.`);
 else linhas.push('✅ Este pagamento concluiu a quitação desta parcela.');
 if(quitado)linhas.push('🎉 O seu empréstimo está totalmente quitado!');
 linhas.push('','Obrigado pela confiança! 😊');
 const mensagem=linhas.join('\n');return {mensagem,url:'https://wa.me/'+telefone+'?text='+encodeURIComponent(mensagem),tipoContato:'confirmacao_pagamento',valorRecebido:valor,emprestimoQuitado:quitado};
}
export async function marcarRecebimentoAvisado(api,id){
 const uid=api.auth.currentUser?.uid;if(!uid)throw Error('Entre novamente como administrador.');
 const ref=api.doc(api.db,'historicoPagamentos',id),contato=api.doc(api.db,'historicoCobrancas','pagamento-'+id);
 await api.runTransaction(api.db,async tx=>{
  const admin=await tx.get(api.doc(api.db,'admins',uid)),pagamento=await tx.get(ref),registro=await tx.get(contato);
  if(!admin.exists())throw Error('Acesso administrativo necessário.');
  if(!pagamento.exists())throw Error('Recebimento não encontrado.');
  const p=pagamento.data();
  if(p.avisoClienteStatus==='avisado')return;
  if(p.avisoClienteStatus!=='pendente')throw Error('Este pagamento não possui aviso pendente.');
  if(!registro.exists()||registro.data().tipoContato!=='confirmacao_pagamento'||registro.data().parcelaId!==p.parcelaId||Number(registro.data().valorRecebido)!==Number(p.valorRecebido))throw Error('Abra primeiro a mensagem deste recebimento pelo botão WhatsApp.');
  tx.update(ref,{avisoClienteStatus:'avisado',avisoClienteEm:api.serverTimestamp(),avisoClientePor:uid});
  tx.update(contato,{status:'enviada',enviadoEm:api.serverTimestamp(),enviadoPor:uid});
 });
}
export function criarAvisosRecebimento(api){
 const abrindo=new Set();
 return {async abrir(id){
  if(abrindo.has(id))return false;abrindo.add(id);
  const janela=window.open('about:blank','_blank');
  if(!janela){abrindo.delete(id);alert('Permita abrir o WhatsApp no navegador.');return false;}janela.opener=null;
  try{
   const ps=await api.getDocFromServer(api.doc(api.db,'historicoPagamentos',id));if(!ps.exists())throw Error('Recebimento não encontrado.');const pagamento=ps.data();
   const ls=await api.getDocFromServer(api.doc(api.db,'emprestimos',pagamento.emprestimoId));if(!ls.exists())throw Error('Empréstimo não encontrado.');const loan={...ls.data(),id:ls.id||pagamento.emprestimoId};
   const parcelasSnap=await api.getDocsFromServer(api.query(api.collection(api.db,'parcelas'),api.where('emprestimoId','==',loan.id)));const parcelas=parcelasSnap.docs.map(d=>({...d.data(),id:d.id}));
   const parcel=parcelas.find(p=>p.id===pagamento.parcelaId);if(!parcel)throw Error('Parcela não encontrada neste empréstimo.');
   if(loan.userId){const u=await api.getDocFromServer(api.doc(api.db,'usuarios',loan.userId));if(u.exists()){loan.telefoneCliente=u.data().telefone||loan.telefoneCliente;loan.nomeCliente=u.data().nome||loan.nomeCliente;}}
   const prepared=prepararAvisoRecebimento(pagamento,loan,parcelas);
   await registrarContato(api,{parcelId:pagamento.parcelaId,parcel,loan},prepared,'pagamento-'+id);
   janela.location.replace(prepared.url);return true;
  }catch(e){janela.close();alert(e.message||'Não foi possível abrir a confirmação.');return false;}
  finally{abrindo.delete(id);}
 },marcar:id=>marcarRecebimentoAvisado(api,id)};
}
