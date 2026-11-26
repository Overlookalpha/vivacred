import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {documentoValido}=require('../functions/lib/validacaoDocumento.js');
test('CPF e NIF conferem dígitos e recusam sequências e documentos alterados',()=>{
 for(const value of ['529.982.247-25','11144477735'])assert.equal(documentoValido(value,'BR'),true);
 for(const value of ['52998224724','11111111111','123',''])assert.equal(documentoValido(value,'BR'),false);
 assert.equal(documentoValido('503504564','PT'),true);
 for(const value of ['503504565','111111111','000000000'])assert.equal(documentoValido(value,'PT'),false);
 const context={};vm.runInNewContext(fs.readFileSync('functions/lib/validacaoDocumento.js','utf8'),context);
 assert.equal(context.documentoCadastroValido('52998224725','BR'),true);
});
test('páginas e backend usam a mesma validação e preservam aprovação',()=>{
 const front=fs.readFileSync('cadastro.html','utf8'),back=fs.readFileSync('functions/index.js','utf8');
 assert.match(front,/globalThis.documentoCadastroValido/);assert.match(back,/require\('\.\/lib\/validacaoDocumento'\)/);
 assert.match(front,/getDocFromServer\(doc\(db,"usuarios"/);assert.match(front,/functions\/invalid-argument/);assert.match(front,/includes\(error.code\)\)await deleteUser/);
 assert.match(back,/status: "pendente_aprovacao"/);assert.match(back,/disabled: true/);
});
test('link abre sem Firebase e mantém endereço mesmo com cópia bloqueada',async()=>{
 const nodes=[];const ids=new Map();
 const document={getElementById:id=>ids.get(id),body:{append:n=>{nodes.push(n);ids.set(n.id,n);}},execCommand:()=>false,createElement:tag=>({tag,style:{},events:{},setAttribute(){},focus(){},select(){},setSelectionRange(){},scrollIntoView(){},addEventListener(k,fn){this.events[k]=fn;},append(...items){this.children=items;}})};
 const context={URL,encodeURIComponent,window:{location:{href:'https://overlookalpha.github.io/vivacred/admin.html?x=1#foo'}},navigator:{clipboard:{writeText:async()=>{throw Error('bloqueado');}}},document};
 vm.runInNewContext(fs.readFileSync('link-cadastro.js','utf8'),context);
 context.window.copiarLinkCadastro();const painel=nodes[0],campo=painel.children[2],copiar=painel.children[3],whats=painel.children[4],status=painel.children[5];
 assert.equal(campo.value,'https://overlookalpha.github.io/vivacred/cadastro.html');
 await copiar.events.click();assert.match(status.textContent,/bloqueou/);assert.match(whats.href,/https:\/\/wa.me\/\?text=/);
 document.execCommand=()=>true;await copiar.events.click();assert.match(status.textContent,/Link copiado/);
 painel.children[6].events.click();assert.equal(painel.hidden,true);context.window.copiarLinkCadastro();assert.equal(painel.hidden,false);assert.equal(nodes.length,1);
});
