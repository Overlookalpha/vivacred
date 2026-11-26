import test from 'node:test';
import assert from 'node:assert/strict';
import {registrarContato,confirmarEnvio,ordenarContatos} from '../historico-cobrancas.mjs';
const expected={parcelId:'p',parcel:{emprestimoId:'e',numero:2},loan:{userId:'u',telefoneCliente:'+5551998208350'}};
function fixture(admin=true){
 const records=new Map([['admins/a',admin?{}:null],['parcelas/p',{emprestimoId:'e',valor:350,pago:0}]]),writes=[];
 const api={auth:{currentUser:{uid:'a'}},db:{},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>({timestamp:true}),runTransaction:async(_,fn)=>{
  let writing=false;const staged=[];
  const result=await fn({get:async k=>{assert.equal(writing,false);return {exists:()=>records.get(k)!=null,data:()=>records.get(k)};},set:(k,v)=>{writing=true;staged.push([k,v,false]);},update:(k,v)=>{writing=true;staged.push([k,v,true]);}});
  for(const [k,v,merge] of staged){records.set(k,merge?{...records.get(k),...v}:v);writes.push([k,v]);}return result;
 }};return {api,records,writes};
}
test('preparar contacto guarda data, telefone e texto sem confirmar envio ou mexer na dívida',async()=>{
 const {api,records,writes}=fixture();await registrarContato(api,expected,{mensagem:'Olá, parcela 2 vence hoje.'},'op');
 const r=records.get('historicoCobrancas/op');assert.equal(r.parcelaId,'p');assert.equal(r.telefone,expected.loan.telefoneCliente);assert.equal(r.status,'preparada');assert.deepEqual(r.criadoEm,{timestamp:true});assert.equal(r.enviadoEm,undefined);
 assert.equal(records.get('parcelas/p').valor,350);assert.equal(writes.length,1);
 await registrarContato(api,expected,{mensagem:'Repetição'},'op');assert.equal(writes.length,1);
});
test('confirmação manual preserva contacto original e repetição não muda a data',async()=>{
 const {api,records,writes}=fixture();await registrarContato(api,expected,{mensagem:'Mensagem'},'op');await confirmarEnvio(api,'op','p');
 const r=records.get('historicoCobrancas/op');assert.equal(r.status,'enviada');assert.equal(r.enviadoPor,'a');assert.equal(r.mensagem,'Mensagem');assert.deepEqual(Object.keys(writes[1][1]).sort(),['enviadoEm','enviadoPor','status']);
 await confirmarEnvio(api,'op','p');assert.equal(writes.length,2);
});
test('bloqueia falta de admin, parcela divergente e contacto de outra parcela',async()=>{
 const denied=fixture(false);await assert.rejects(registrarContato(denied.api,expected,{mensagem:'Teste'},'op'));assert.equal(denied.writes.length,0);
 const f=fixture();await assert.rejects(registrarContato(f.api,{...expected,parcel:{emprestimoId:'outro'}},{mensagem:'Teste'},'op'));assert.equal(f.writes.length,0);
 await registrarContato(f.api,expected,{mensagem:'Teste'},'op');await assert.rejects(confirmarEnvio(f.api,'op','outra'));assert.equal(f.writes.length,1);
});
test('histórico ordena do contacto mais recente ao mais antigo sem modificar entrada',()=>{
 const records=[{id:'a',criadoEm:{toMillis:()=>1}},{id:'b',criadoEm:{toMillis:()=>3}},{id:'c',criadoEm:{toMillis:()=>2}}];
 assert.deepEqual(ordenarContatos(records).map(r=>r.id),['b','c','a']);assert.equal(records[0].id,'a');
});
