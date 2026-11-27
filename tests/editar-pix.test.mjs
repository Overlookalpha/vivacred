import test from 'node:test';
import assert from 'node:assert/strict';
import {salvarPixCliente,criarEditorPix} from '../editar-pix-cliente.mjs';
function api(pix='antiga',exists=true){const writes=[];return {writes,db:{},doc:(db,col,id)=>({col,id}),runTransaction:async(db,fn)=>fn({get:async()=>({exists:()=>exists,data:()=>({pix})}),update:(ref,value)=>writes.push({ref,value})})};}
test('salva somente a chave exata no perfil correto sem alterar empréstimos',async()=>{
 const a=api();assert.equal(await salvarPixCliente(a,'cliente-1','antiga',' +55 (51) 99999-0000 '),'+55 (51) 99999-0000');
 assert.deepEqual(a.writes,[{ref:{col:'usuarios',id:'cliente-1'},value:{pix:'+55 (51) 99999-0000'}}]);
});
test('bloqueia concorrência, cadastro ausente, UID inválido e chave vazia',async()=>{
 for(const [a,id,old,key] of [[api('outra'),'uid','antiga','nova'],[api('',false),'uid','','nova'],[api(),'a/b','antiga','nova'],[api(),'uid','antiga',' '],[api(),'uid','antiga','x\ny']]){
  await assert.rejects(salvarPixCliente(a,id,old,key));assert.equal(a.writes.length,0);
 }
});
function dom(){return {createElement:tag=>({tag,style:{},events:{},children:[],setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},append(...els){this.children.push(...els);},focus(){}})};}
test('cancelar e recusar confirmação não gravam; falha preserva texto para tentar de novo',async()=>{
 let writes=0,confirma=false;const host=criarEditorPix({root:dom(),chave:'antiga',confirmar:()=>confirma,salvar:async()=>{writes++;throw Error('Sem conexão');}});
 const [edit,form,status]=host.children;const input=form.children[0].children[0],cancel=form.children[3];
 edit.events.click();input.value='nova';cancel.events.click();assert.equal(input.value,'antiga');assert.equal(form.hidden,true);assert.equal(writes,0);
 edit.events.click();input.value='nova';await form.events.submit({preventDefault(){}});assert.equal(writes,0);
 confirma=true;await form.events.submit({preventDefault(){}});assert.equal(writes,1);assert.equal(input.value,'nova');assert.equal(input.disabled,false);assert.equal(form.hidden,false);assert.match(status.textContent,/Sem conexão/);
});
