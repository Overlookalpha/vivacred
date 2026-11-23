import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const localRequire=createRequire(new URL('../functions/index.js',import.meta.url));
function runtime(parcelas=[],overrides={}){
  const rows=new Map([['usuarios/u',{email:'u@example.test',score:40,pais:'BR',status:'ativo',nome:'Fictício',telefone:'000',cpf:'000',pix:'teste',...overrides}],['emprestimos/e',{userId:'u',status:'ativo',valor:500}],...parcelas.map((p,i)=>['parcelas/'+i,{...p,userId:'u',emprestimoId:'e'}])]);
  const writes=[];
  const snapshot=key=>({id:key.split('/')[1],exists:rows.has(key),data:()=>rows.get(key)});
  function collection(name,filters=[],max=Infinity){return {
    doc(id='novo'){const key=name+'/'+id;return {key,id:id??'novo',get:async()=>snapshot(key)};},
    where(k,op,v){return collection(name,[...filters,[k,v]],max);},
    limit(n){return collection(name,filters,n);},
    get:async()=>{const docs=[...rows.keys()].filter(k=>k.startsWith(name+'/')&&filters.every(([f,v])=>rows.get(k)[f]===v)).slice(0,max).map(snapshot);return {docs,empty:!docs.length};}
  };}
  const tx={get:ref=>ref.get(),create:(ref,data)=>writes.push([ref.key,data])};
  const db={collection,runTransaction:fn=>fn(tx)};
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  const exports={};runInNewContext(readFileSync(new URL('../functions/index.js',import.meta.url),'utf8'),{exports,require(name){
    if(name==='firebase-functions/v2/https')return {onCall:(_,fn)=>fn,HttpsError};
    if(name==='firebase-functions/v2/firestore')return {onDocumentCreated:(_,fn)=>fn};
    if(name==='firebase-admin/firestore')return {getFirestore:()=>db,FieldValue:{serverTimestamp:()=>123}};
    if(name==='firebase-admin/app')return {getApps:()=>[{}]};
    return localRequire(name);
  }});
  const request={auth:{uid:'u',token:{email:'u@example.test'}},data:{valor:500,parcelas:1,avalista:{nome:'Teste',telefone:'000000000',cpf:'00000000000'}}};
  return {exports,request,writes};
}
test('consulta real exige autenticação e não lê ID fornecido pelo cliente',async()=>{
  const h=runtime();await assert.rejects(h.exports.obterPerfilCredito({}),e=>e.code==='unauthenticated');
  const p=await h.exports.obterPerfilCredito({...h.request,data:{userId:'outro',score:100,nota:100}});
  assert.equal(p.normal,800);assert.equal(p.disponivel,800);assert.equal(h.writes.length,0);
});
test('solicitação real rejeita acima do limite reduzido antes de gravar contrato ou aviso',async()=>{
  const h=runtime([{valor:100,pago:100,status:'pago',vencimento:'2026-01-01',dataPagamentoReal:'2026-01-21'}]);
  const p=await h.exports.obterPerfilCredito(h.request);assert.equal(p.disponivel,400);
  await assert.rejects(h.exports.solicitarCredito(h.request),e=>e.code==='invalid-argument');assert.equal(h.writes.length,0);
  const result=await h.exports.solicitarCredito({...h.request,data:{...h.request.data,valor:400}});
  assert.equal(result.id,'novo');assert.equal(h.writes.length,2);
});
test('pendência e perda bloqueiam solicitação real; regra não depende de dados da tela',async()=>{
  const h=runtime([{valor:100,pago:0,vencimento:'2026-01-01',status:'pendente'}]);
  assert.equal((await h.exports.obterPerfilCredito(h.request)).disponivel,0);
  await assert.rejects(h.exports.solicitarCredito(h.request),e=>e.code==='failed-precondition');assert.equal(h.writes.length,0);
});
