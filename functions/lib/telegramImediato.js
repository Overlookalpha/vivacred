"use strict";
const TIPOS = new Set(["cadastro", "emprestimo", "saque", "atendimento", "negociacao", "pagamento_aberto", "pagamento_confirmado"]);
const TITULOS = {cadastro:"🆕 NOVO CADASTRO",emprestimo:"📥 PEDIDO DE EMPRÉSTIMO",saque:"🪙 PEDIDO DE SAQUE",atendimento:"💬 ATENDIMENTO SOLICITADO",negociacao:"🤝 PEDIDO DE NEGOCIAÇÃO",pagamento_aberto:"👀 CLIENTE ABRIU PAGAR PARCELA",pagamento_confirmado:"📎 CLIENTE INFORMOU PAGAMENTO"};
const COLECOES = {emprestimo:"emprestimos",saque:"saques",negociacao:"negociacoes",pagamento_aberto:"parcelas",pagamento_confirmado:"parcelas"};
function moeda(v,pais){return new Intl.NumberFormat(pais==="PT"?"pt-PT":"pt-BR",{style:"currency",currency:pais==="PT"?"EUR":"BRL"}).format(Number(v||0));}
async function mensagem(db,evento,id){
 const tipo=evento.tipoTelegram,uid=evento.criadoPor;
 if(!TIPOS.has(tipo)||!uid)throw Error("Evento de cliente inválido");
 const userSnap=await db.collection("usuarios").doc(uid).get();
 if(!userSnap.exists)throw Error("Cadastro não encontrado");
 const user=userSnap.data();let item={};
 if(COLECOES[tipo]){
  const itemId=evento.dadosTelegram?.id;
  if(!itemId||String(itemId).includes("/"))throw Error("Referência inválida");
  const snap=await db.collection(COLECOES[tipo]).doc(itemId).get();
  if(!snap.exists||snap.data().userId!==uid)throw Error("Registro não pertence ao cliente");
  item=snap.data();
 }
 const pais=item.pais||user.pais||"BR";
 const linhas=[TITULOS[tipo],"",`👤 ${user.nome||user.email||"Cliente"}`,`📞 ${item.telefoneCliente||user.telefone||"Não informado"}`,`🌍 ${pais}`];
 if(tipo==="cadastro"){
  linhas.push(`📍 ${user.cidade||"Cidade não informada"}`,`📧 ${user.email||"Não informado"}`);
  if(user.indicadoPor){const snap=await db.collection("usuarios").doc(user.indicadoPor).get();linhas.push(`🤝 Indicado por: ${snap.exists?snap.data().nome||"Cliente cadastrado":"Cadastro por indicação"}`);}
  linhas.push("👉 Cadastro disponível para conferência no administrador.");
 }
 if(tipo==="emprestimo")linhas.push(`💰 ${moeda(item.valor,pais)}`,`📄 ${item.parcelas} parcela(s)`,`👤 Avalista: ${item.nomeAvalista||"Não informado"}`,`📞 Avalista: ${item.telefoneAvalista||"Não informado"}`,`Situação atual: ${item.status||"Não informada"}`,"👉 Analise o pedido no administrador.");
 if(tipo==="saque")linhas.push(`🪙 ${item.isaCoins} ISC`,`💰 ${moeda(item.valor,pais)}`,`🔑 Pix: ${item.pix||"Não informado"}`,`Situação atual: ${item.status||"Não informada"}`,"👉 Confira o pedido antes de realizar o pagamento.");
 if(tipo==="negociacao")linhas.push(`📄 Parcela ${item.numeroParcela||"Não informada"}`,`💬 ${item.motivo||"Motivo não informado"}`,"👉 Confira a negociação no administrador.");
 if(tipo==="atendimento")linhas.push("👉 Cliente solicitou revisão de renda ou limite. Entre em contato.");
 if(tipo.startsWith("pagamento_")){
  const saldo=item.restante??Math.max(0,Number(item.valor||0)-Number(item.pago||0));
  linhas.push(`📄 Parcela ${item.numero||"Não informada"}`,`💰 Saldo registrado: ${moeda(saldo,pais)}`);
  if(tipo==="pagamento_aberto")linhas.push("👀 Abriu a tela para pagar. Isso NÃO confirma pagamento.","👉 Você pode conferir sua conta bancária.");
  else linhas.push(item.comprovanteUrl?`📎 Comprovante: ${item.comprovanteUrl}`:"📎 Sem comprovante anexado","👉 Cliente informou pagamento; confira o banco antes de dar baixa.");
 }
 const data=evento.data?.toDate?.();
 linhas.push("",`🕒 ${data?data.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})+" (Brasília)":"Horário não registrado"}`,`🔎 Aviso: ${id}`,"🔗 https://overlookalpha.github.io/vivacred/admin.html");
 return linhas.join("\n").slice(0,3900);
}
async function entregar({db,ref,token,chatId,FieldValue,fetchImpl=fetch}){
 const reservado=await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);if(!snap.exists)return null;
  const e=snap.data();if(!TIPOS.has(e.tipoTelegram)||e.statusTelegram!=="pendente")return null;
  tx.update(ref,{statusTelegram:"processando",processandoEm:FieldValue.serverTimestamp(),tentativasTelegram:Number(e.tentativasTelegram||0)+1});return e;
 });
 if(!reservado)return {ignorado:true};
 try{
  const texto=await mensagem(db,reservado,ref.id);
  const response=await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text:texto}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok||!result.ok)throw Error(`Telegram HTTP ${response.status}: ${result.description||"envio recusado"}`);
  await ref.update({statusTelegram:"enviado",enviadoEm:FieldValue.serverTimestamp(),telegramMessageId:result.result?.message_id||null,canalEnvio:"imediato",erroTelegram:FieldValue.delete(),proximaTentativaTelegramEm:FieldValue.delete()});
  return {enviado:true};
 }catch(error){
  // Não incluir URL do bot ou credenciais em dados e logs.
  const safe=String(error.message||"Falha no envio").split(token).join("[OCULTO]").slice(0,250);
  await ref.update({statusTelegram:"pendente",erroTelegram:safe,processadoEm:FieldValue.serverTimestamp()});
  return {pendente:true};
 }
}
module.exports={TIPOS,mensagem,entregar};
