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
test('link funciona com clipboard, fallback e compartilhamento sem envio automático',async()=>{
 const html=fs.readFileSync('admin.html','utf8');const code=html.slice(html.indexOf('window.copiarLinkCadastro ='),html.indexOf('window.sairAdmin ='));
 let copied;const context={URL,window:{location:{href:'https://overlookalpha.github.io/vivacred/admin.html?x=1#foo'}},navigator:{clipboard:{writeText:async x=>copied=x}},alert:()=>{}};
 vm.runInNewContext(code,context);await context.window.copiarLinkCadastro();assert.equal(copied,'https://overlookalpha.github.io/vivacred/cadastro.html');
 const nodes=[];context.navigator={};context.document={body:{append:x=>nodes.push(x)},execCommand:()=>true,createElement:()=>({style:{},setAttribute(){},focus(){},select(){},setSelectionRange(){},remove(){}})};
 await context.window.copiarLinkCadastro();assert.equal(nodes[0].value,copied);
 assert.match(code,/https:\/\/wa.me\/\?text=/);assert.match(code,/dialog.showModal/);
});
