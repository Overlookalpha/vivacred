import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {salvarPagamentoConferido,previaPagamentoReal} from '../conferencia-pagamento.mjs';
import {prepararQuitacaoAtomica} from '../quitacao-atomica.mjs';
import {previaMoedas} from '../previa-moedas.mjs';
const now=new Date('2026-11-26T12:00:00Z');
function fixture({fail=false,missingUser=false,indicado=false,missingReferrer=false}={}){
 const parcel={valor:270,pago:0,restante:270,status:'pendente',emprestimoId:'e',userId:'u',numero:1,vencimento:new Date('2026-12-16T12:00:00Z')};
 const loan={valor:200,valorFinal:270,parcelas:1,parcelasPagas:0,userId:'u',pais:'BR',status:'ativo'};
 const user={nome:'Cliente Simulado',isaCoins:1000,pagamentosAdiantados:0,...(indicado?{indicadoPor:'r'}:{})};
 const rows=new Map([['admins/a',{}],['parcelas/p',parcel],['emprestimos/e',loan],['configuracoes/financeiro',{recebido:0}]]);
 if(!missingUser)rows.set('usuarios/u',user);if(indicado&&!missingReferrer)rows.set('usuarios/r',{isaCoins:200});
 const api={db:{},auth:{currentUser:{uid:'a'}},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>now,prepararQuitacao:prepararQuitacaoAtomica,aplicarFinanceiro:(tx,v)=>tx.update('configuracoes/financeiro',{recebido:v}),runTransaction:async(_,fn)=>{
  const staged=[];let writing=false;
  const result=await fn({get:async key=>{assert.equal(writing,false,'Leitura depois de escrita não permitida');return {exists:()=>rows.has(key),data:()=>rows.get(key)};},update:(key,value)=>{writing=true;assert(rows.has(key));staged.push([key,value,true]);},set:(key,value)=>{writing=true;staged.push([key,value,false]);}});
  if(fail)throw Error('Falha simulada ao salvar');
  for(const [key,value,merge] of staged)rows.set(key,merge?{...rows.get(key),...value}:value);
  return result;
 }};
 const preview=previaPagamentoReal(parcel,loan,{valor:270,juros:0,multa:0,dataReal:'2026-11-26'},'confirmar',now);
 const save=()=>salvarPagamentoConferido(api,{parcelaId:'p',parcel,loan},preview,{pago:270,restante:0,status:'pago',dataPagamentoReal:now},'op1',now);
 return {rows,save,parcel,loan,user};
}
test('quitação grava parcela, caixa, saldo de moedas, histórico e fim do empréstimo juntos',async()=>{
 const f=fixture();await f.save();
 assert.equal(f.rows.get('parcelas/p').status,'pago');assert.equal(f.rows.get('configuracoes/financeiro').recebido,270);
 assert.equal(f.rows.get('usuarios/u').isaCoins,1470);assert.equal(f.rows.get('usuarios/u').pagamentosAdiantados,1);
 assert.equal(f.rows.get('emprestimos/e').status,'finalizado');assert.equal(f.rows.get('emprestimos/e').parcelasPagas,1);
 assert.equal(f.rows.get('historicoPagamentos/op1').isaCoinsCreditadas,previaMoedas(f.parcel,f.loan,f.user,now).total);
 assert.equal(f.rows.get('atividadesQuitacao/op1').isaCoinsGanhos,470);
 await assert.rejects(f.save());assert.equal(f.rows.get('usuarios/u').isaCoins,1470);assert.equal(f.rows.get('configuracoes/financeiro').recebido,270);
});
test('falha na gravação ou cadastro ausente preserva todos os dados originais',async()=>{
 for(const options of [{fail:true},{missingUser:true},{indicado:true,missingReferrer:true}]){
  const f=fixture(options),before=JSON.stringify([...f.rows]);await assert.rejects(f.save());assert.equal(JSON.stringify([...f.rows]),before);
 }
});
test('bônus do indicado e do indicador pertencem à mesma confirmação',async()=>{
 const f=fixture({indicado:true});await f.save();assert.equal(f.rows.get('usuarios/u').isaCoins,6470);assert.equal(f.rows.get('usuarios/r').isaCoins,5200);assert.equal(f.rows.get('usuarios/u').indicacaoPremiada,true);assert.equal(f.rows.get('historicoPagamentos/op1').bonusIndicacaoISC,5000);
});
test('admin liga quitação atômica e não faz crédito de moedas após a transação',()=>{
 const html=readFileSync('admin.html','utf8'),a=html.indexOf('window.confirmarParcela ='),b=html.indexOf('// 📥 ABA: SOLICITAÇÕES',a),fn=html.slice(a,b);
 assert.match(html,/prepararQuitacao:prepararQuitacaoAtomica/);assert.doesNotMatch(fn,/loteBonus|bonusISC|updateDoc\(emprestimoRef/);assert.match(fn,/await salvarPagamentoConferido/);
});
