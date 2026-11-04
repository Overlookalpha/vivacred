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
import {calcularCobrancaParcela} from '../cobranca-parcela.mjs';
test('cartão do aviso mostra juros futuros, adicionais, multa e total sem alterar a parcela',async()=>{
 const f=fixture({status:'ativa',data:'2026-11-09',pais:'BR',scope:'parcela'});
 const parcel={valor:350,pago:0,status:'pendente',vencimento:new Date('2026-11-03T12:00:00Z'),emprestimoId:'e',userId:'u'};
 const original=structuredClone(parcel);
 const api={db:{},doc:(_,c,id)=>c+'/'+id,collection:(_,c)=>c,calculate:calcularCobrancaParcela,now:()=>new Date('2026-11-04T12:00:00Z'),getDocsFromServer:async()=>({docs:[{id:'parcela-p',data:()=>({status:'ativa',data:'2026-11-09',pais:'BR',scope:'parcela'})}]})};
 const panel=createPaymentFollowup(api);await panel.refresh();const html=panel.cardHTML('p',parcel,{pais:'BR'}).replaceAll('\u00a0',' ');
 assert.ok(html.includes('Juros totais até a data: <strong>R$ 21,00'));
 assert.ok(html.includes('Juros adicionais de hoje até a data: R$ 17,50'));
 assert.ok(html.includes('Multa: R$ 17,50'));
 assert.ok(html.includes('Total estimado para pagar: R$ 388,50'));
 assert.deepEqual(parcel,original);
});
test('cartão respeita pagamentos parciais e acordo sem encargos',async()=>{
 globalThis.document={addEventListener(){}};
 const api={db:{},collection:(_,c)=>c,calculate:calcularCobrancaParcela,now:()=>new Date('2026-11-04T12:00:00Z'),getDocsFromServer:async()=>({docs:[{id:'parcela-p',data:()=>({status:'ativa',data:'2026-11-09',pais:'PT',scope:'parcela'})}]})};
 const panel=createPaymentFollowup(api);await panel.refresh();const parcel={valor:350,pago:100,status:'pendente',vencimento:new Date('2026-11-03T12:00:00Z'),acordoSemEncargos:true};
 const html=panel.cardHTML('p',parcel,{pais:'PT'}).replaceAll('\u00a0',' ');assert.ok(html.includes('Total estimado para pagar: € 250,00'));assert.ok(html.includes('Multa: € 0,00'));
});
test('promessa vencida ou data inválida não exibe projeção fictícia',async()=>{
 globalThis.document={addEventListener(){}};
 for(const data of ['2026-11-01','invalida']){const api={db:{},collection:(_,c)=>c,calculate:()=>{throw Error('não deveria calcular');},now:()=>new Date('2026-11-04T12:00:00Z'),getDocsFromServer:async()=>({docs:[{id:'parcela-p',data:()=>({status:'ativa',data,pais:'BR',scope:'parcela'})}]})};const panel=createPaymentFollowup(api);await panel.refresh();assert.ok(!panel.cardHTML('p',{},{}).includes('Total estimado para pagar'));}
});
