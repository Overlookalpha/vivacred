import test from 'node:test';import assert from 'node:assert/strict';
import {createPaymentFollowup} from '../acompanhamento-pagamento-ui.mjs';
const now=new Date(),future=new Date(now);future.setDate(future.getDate()+3);const key=future.toISOString().slice(0,10);
function fixture(notice,fail=false){
 const records=new Map([['parcelas/p',{status:'pendente',emprestimoId:'e',userId:'u'}],['emprestimos/e',{userId:'u',pais:'BR',status:'ativo'}],['promessasPagamento/cliente-u',notice]]);
 globalThis.document={addEventListener(){}};const alerts=[];globalThis.alert=text=>alerts.push(text);
 const snap=data=>({exists:()=>!!data,data:()=>data});
 const api={db:{},doc:(_,c,id)=>c+'/'+id,collection:(_,c)=>c,getDocFromServer:async ref=>{if(fail)throw Error('offline');return snap(records.get(ref));},getDocsFromServer:async()=>({docs:notice?[{id:'cliente-u',data:()=>notice}]:[]})};
 return {panel:createPaymentFollowup(api),records,alerts};
}
test('promessa vigente bloqueia o contato de cobrança no administrador',async()=>{const f=fixture({status:'ativa',data:key,pais:'BR',scope:'cliente'});assert.equal(await f.panel.canContact('p'),false);assert.ok(f.alerts[0].includes('pausado'));});
test('prazo vencido libera contato sem enviar mensagem',async()=>{const f=fixture({status:'ativa',data:'2020-01-01',pais:'BR',scope:'cliente'});assert.equal(await f.panel.canContact('p'),true);assert.equal(f.alerts.length,0);});
test('falha na conferência dos avisos não abre cobrança',async()=>{const f=fixture(null,true);assert.equal(await f.panel.canContact('p'),false);assert.ok(f.alerts[0].includes('Nenhum contato'));});
test('observação aparece como texto escapado no dashboard',async()=>{const f=fixture({status:'ativa',data:key,pais:'BR',scope:'cliente',observacao:'<img src=x onerror=alert(1)>'});await f.panel.refresh();const html=f.panel.cardHTML('p',{}, {userId:'u'});assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('data-estimar-parcela="p"'));});
