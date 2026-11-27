import test from 'node:test';
import assert from 'node:assert/strict';
import {mostrarMensagemWhatsApp} from '../abrir-whatsapp-ui.mjs';
test('painel oferece link direto e texto selecionável sem enviar nem abrir janela automaticamente',()=>{
 const el=tag=>({tag,style:{},children:[],events:{},setAttribute(k,v){this[k]=v;},append(...v){this.children.push(...v);},addEventListener(k,v){this.events[k]=v;},showModal(){this.aberto=true;},close(){this.aberto=false;},remove(){this.removido=true;}});
 const root={createElement:el,body:el('body')};
 const mensagem='Olá Everton! Parcela de R$ 370,00 vence amanhã.';
 const url='https://wa.me/5551998208350?text='+encodeURIComponent(mensagem);
 const d=mostrarMensagemWhatsApp({mensagem,url},root),link=d.children.find(c=>c.tag==='a'),campo=d.children.find(c=>c.tag==='textarea');
 assert.equal(d.aberto,true);assert.equal(link.href,url);assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);assert.equal(campo.value,mensagem);assert.equal(campo.readOnly,true);
 d.children.at(-1).events.click();assert.equal(d.removido,true);
 assert.throws(()=>mostrarMensagemWhatsApp({mensagem,url:'javascript:alert(1)'},root));
});
