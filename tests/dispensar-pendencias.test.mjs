import test from 'node:test';
import assert from 'node:assert/strict';
import {aplicarDispensas,assinaturaAviso,salvarDispensa} from '../dispensar-pendencias.mjs';
const cliente={id:'u',nome:'Cliente',pix:'Teste',problemas:['Chave de teste']};
test('dispensa persiste entre leituras e mudança no cadastro torna aviso visível novamente',()=>{
 const registro={id:'cadastros-u',status:'dispensado',assinatura:assinaturaAviso('cadastros',cliente)};
 const dados={cadastros:[cliente]};const antes=JSON.stringify(dados);
 assert.equal(aplicarDispensas(dados,[registro]).cadastros[0].dispensado,true);
 assert.equal(aplicarDispensas(JSON.parse(JSON.stringify(dados)),[registro]).cadastros[0].dispensado,true);
 assert.equal(aplicarDispensas({cadastros:[{...cliente,pix:'nova'}]},[registro]).cadastros[0].dispensado,false);
 assert.equal(aplicarDispensas(dados,[{...registro,status:'restaurado'}]).cadastros[0].dispensado,false);
 assert.equal(JSON.stringify(dados),antes);
});
test('dispensar confirmação não marca mensagem enviada nem dispensa outros pagamentos',()=>{
 const row={id:'r',valorRecebido:200},dados={avisos:[row,{id:'r2',valorRecebido:300}]};
 const r=aplicarDispensas(dados,[{id:'avisos-r',status:'dispensado',assinatura:assinaturaAviso('avisos',row)}]);
 assert.equal(r.avisos[0].dispensado,true);assert.equal(r.avisos[1].dispensado,false);assert.equal(row.status,undefined);
});
function fixture(admin=true){
 const rows=new Map([['admins/a',admin?{}:null]]),writes=[];
 const api={db:{},auth:{currentUser:{uid:'a'}},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>({server:true}),runTransaction:async(_,fn)=>{
  let writing=false;const staged=[];await fn({get:async ref=>{assert.equal(writing,false);return {exists:()=>!!rows.get(ref),data:()=>rows.get(ref)};},set:(ref,data)=>{writing=true;staged.push([ref,data]);}});
  for(const [ref,data] of staged){rows.set(ref,data);writes.push([ref,data]);}
 }};return {api,rows,writes};
}
test('dispensar e restaurar escrevem somente preferências administrativas com autor e data',async()=>{
 const f=fixture(),row=aplicarDispensas({cadastros:[cliente]}).cadastros[0];
 await salvarDispensa(f.api,'cadastros',row);assert.equal(f.rows.get('pendenciasDispensadas/cadastros-u').status,'dispensado');
 await salvarDispensa(f.api,'cadastros',row,true);assert.equal(f.rows.get('pendenciasDispensadas/cadastros-u').status,'restaurado');
 assert.equal(f.writes.length,2);assert.ok(f.writes.every(([ref,v])=>ref.startsWith('pendenciasDispensadas/')&&v.por==='a'&&v.em.server));
});
test('bloqueia usuário sem admin, referência inválida e restauração de versão diferente',async()=>{
 const f=fixture(false);await assert.rejects(salvarDispensa(f.api,'cadastros',cliente));assert.equal(f.writes.length,0);
 const a=fixture();await assert.rejects(salvarDispensa(a.api,'cadastros',{...cliente,id:'x/y'}));await assert.rejects(salvarDispensa(a.api,'cadastros',cliente,true));assert.equal(a.writes.length,0);
});
