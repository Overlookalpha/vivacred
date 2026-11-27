import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dadosPixCliente,criarPixCliente} from '../pix-cliente-ui.mjs';
function dom(copy=false){return {execCommand:()=>copy,createElement:tag=>({tag,style:{},events:{},children:[],setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this.events[k]=fn;},append(...x){this.children.push(...x);},focus(){},select(){},setSelectionRange(){}})};}
test('prioriza cadastro pelo cliente vinculado e mantém chave sem alterar formatação',()=>{
 assert.deepEqual(dadosPixCliente({pixCliente:'antiga',pais:'BR'},{pix:' atual@example.test '}),{chave:'atual@example.test',pais:'BR',fonte:'cadastro',divergente:true});
 assert.equal(dadosPixCliente({pixCliente:'+55 (51) 99999-0000'},{}).chave,'+55 (51) 99999-0000');assert.equal(dadosPixCliente({},{}).chave,'');
});
test('cópia aceita chave exata; alternativa manual mantém campo visível',async()=>{
 let copied;const root=dom(),host=criarPixCliente({pixCliente:'TESTE-PIX-SEM-VALOR'},null,root,{writeText:async value=>{copied=value;}});
 const [title,field,button,status]=host.children;assert.equal(field.readOnly,true);await button.events.click();assert.equal(copied,'TESTE-PIX-SEM-VALOR');assert.match(status.textContent,/Copiado/);
 const fallback=criarPixCliente({pixCliente:'TESTE'},null,root,{writeText:async()=>{throw Error('bloqueado');}});await fallback.children[2].events.click();assert.match(fallback.children[3].textContent,/manualmente/);assert.equal(fallback.children[1].value,'TESTE');
});
test('sem chave não oferece botão vazio e PT usa MB WAY',()=>{
 const empty=criarPixCliente({},null,dom());assert.equal(empty.children.length,2);assert.match(empty.children[1].textContent,/não informada/);
 const pt=criarPixCliente({pais:'PT',pixCliente:'351900000000'},null,dom(true));assert.match(pt.children[2].textContent,/MB WAY/);
});
test('chave não é interpretada como HTML e ambos os cartões usam o componente',()=>{
 const value='<img src=x onerror=alert(1)>';const host=criarPixCliente({pixCliente:value},null,dom());assert.equal(host.children[1].value,value);assert.equal(host.children[1].innerHTML,undefined);
 const html=readFileSync('admin.html','utf8');assert.match(html,/criarPixCliente\(dados,perfisPixPorId.get\(dados.userId\)\)/);assert.match(html,/criarPixCliente\(emp,perfisPixAtivos.get\(emp.userId\)\)/);
});
