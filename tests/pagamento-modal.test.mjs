import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../home.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('let abrindoPagamentoParcela = false;'),html.indexOf('</script>',html.indexOf('let abrindoPagamentoParcela = false;')));
test('cliques concorrentes abrem um modal e fechar funciona mesmo com aviso pendente',async()=>{
 let modais=[],avisos=0;
 const ctx={window:{},console,doc:()=>({}),db:{},usuarioLogado:{uid:'u'},paisUsuarioGlobal:'BR',mostrarAviso:()=>{},
 getDoc:async()=>({exists:()=>true,data:()=>({valor:50,numero:1})}),
 enviarTelegram:()=>{avisos++;return new Promise(()=>{});},
 document:{getElementById:()=>modais[0],createElement:()=>{
 const nodes={};return {style:{},querySelector(id){return nodes[id]??={before(){},addEventListener(k,fn){this[k]=fn;}};},remove(){modais=modais.filter(m=>m!==this);}};
 },body:{appendChild(m){modais.push(m);}}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 await Promise.all([ctx.window.gerarPagamentoParcela('1'),ctx.window.gerarPagamentoParcela('1')]);
 assert.equal(modais.length,1);assert.equal(avisos,1);
 modais[0].querySelector('#btnFecharPagamentoParcela').click({preventDefault(){}});
 assert.equal(modais.length,0);
 await ctx.window.gerarPagamentoParcela('1');assert.equal(modais.length,1);
});
