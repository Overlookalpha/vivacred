import {aguardandoConferencia} from './previa-moedas.mjs';
import {resultadoPromessa} from './acompanhamento-pagamento.mjs';
const teste=r=>r?.teste===true||r?.tipoRegistro==='teste';
const texto=v=>typeof v==='string'?v.trim():'';
export function conferirCadastro(u){
 const problemas=[];const pt=u.pais==='PT';
 if(!texto(u.nome))problemas.push('Nome não informado');
 const telefone=texto(u.telefone),digitos=telefone.replace(/\D/g,'');
 if(!telefone)problemas.push('Telefone não informado');
 else if(!/^\+?[\d\s().-]+$/.test(telefone)||digitos.length<9||digitos.length>15)problemas.push('Telefone com formato a conferir');
 const email=texto(u.email);
 if(!email)problemas.push('E-mail não informado');
 else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))problemas.push('E-mail com formato a conferir');
 const documento=texto(u.cpf||u.nif),numero=documento.replace(/\D/g,'');
 if(!documento)problemas.push(pt?'NIF não informado':'CPF não informado');
 else if(numero.length!==(pt?9:11)||/^(\d)\1+$/.test(numero))problemas.push(pt?'NIF com formato a conferir':'CPF com formato a conferir');
 const pix=texto(u.pix);
 if(!pix)problemas.push(pt?'MB WAY não informado':'Chave Pix não informada');
 else if(/^(teste(?:\s.*)?|test|pix|chave|exemplo|n[ãa]o informado|[-.]+)$/i.test(pix))problemas.push(pt?'MB WAY parece um preenchimento de teste':'Chave Pix parece um preenchimento de teste');
 return problemas;
}
export function resumirPendencias({usuarios=[],emprestimos=[],parcelas=[],promessas=[]},agora=new Date()){
 const clientes=usuarios.filter(u=>!teste(u)),loans=emprestimos.filter(e=>!teste(e));
 const porLoan=new Map(loans.map(e=>[e.id,e])),porCliente=new Map(clientes.map(u=>[u.id,u]));
 const porParcela=new Map(parcelas.filter(p=>!teste(p)).map(p=>[p.id,p]));
 const nome=(uid,l)=>porCliente.get(uid)?.nome||l?.nomeCliente||'Cliente sem nome';
 const encerrado=l=>l.finalizado===true||['quitado','finalizado','cancelado','rejeitado','perdido'].includes(l.status);
 const contas=clientes.filter(u=>u.status==='pendente_aprovacao').map(u=>({id:u.id,nome:u.nome||'Cliente sem nome'}));
 const pedidos=loans.filter(l=>l.status==='aguardando').map(l=>({id:l.id,userId:l.userId,nome:nome(l.userId,l)}));
 const pagamentos=[];
 for(const p of porParcela.values()){
  const l=porLoan.get(p.emprestimoId);
  if(l&&!encerrado(l)&&!['perdido','cancelado','finalizado'].includes(p.status)&&aguardandoConferencia(p))pagamentos.push({id:p.id,emprestimoId:l.id,userId:l.userId,nome:nome(l.userId,l),parcela:p.numero||p.parcela||'—'});
 }
 const vencidas=[],conferir=[],vistos=new Set();
 for(const n of promessas){
  if(teste(n)||n.status!=='ativa')continue;
  const p=porParcela.get(n.parcelaId),l=p&&porLoan.get(p.emprestimoId);
  if(!p||!l){conferir.push({id:n.id,nome:nome(n.userId),motivo:'Promessa sem parcela ou empréstimo disponível para conferir'});continue;}
  if(encerrado(l)||['pago','perdido','cancelado','finalizado'].includes(p.status))continue;
  const r=resultadoPromessa(n,p,l,agora);
  const item={id:n.id,emprestimoId:l.id,userId:l.userId,nome:nome(l.userId,l),data:n.data,motivo:r.detalhe};
  if(r.tipo==='vencida'&&!vistos.has(p.id)){vistos.add(p.id);vencidas.push(item);}
  else if(r.tipo==='conferir')conferir.push(item);
 }
 const cadastros=clientes.map(u=>({...u,problemas:conferirCadastro(u)})).filter(u=>u.problemas.length);
 return {contas,pedidos,pagamentos,vencidas,conferir,cadastros};
}
