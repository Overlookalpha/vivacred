import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararWhatsAppParcela} from '../mensagem-cobranca-whatsapp.mjs';
import {createPaymentFollowup} from '../acompanhamento-pagamento-ui.mjs';
const now=new Date('2026-11-12T12:00:00Z');
const loan={nomeCliente:'Maria',telefoneCliente:'+55 (51) 99999-1234',pais:'BR',status:'ativo'};
const parcel={valor:350,pago:0,status:'pendente',numero:2,vencimento:new Date('2026-11-15T12:00:00Z')};
const text=(p={},l={},n=now)=>prepararWhatsAppParcela({...parcel,...p},{...loan,...l},n).mensagem.replaceAll('\u00a0',' ');
test('futuro e hoje usam mensagens próprias e URL codificada',()=>{
 assert.match(text(),/vence em 3 dias, em 15\/11\/2026/);assert.doesNotMatch(text(),/atraso|Multa/);
 const today=text({vencimento:now});assert.match(today,/vence hoje, 12\/11\/2026/);assert.match(today,/R\$ 350,00/);
 assert.match(text({vencimento:new Date('2026-11-13T12:00:00Z')}),/vence amanhã/);
 const r=prepararWhatsAppParcela(parcel,loan,now);assert.equal(new URL(r.url).searchParams.get('text'),r.mensagem);
});
test('atraso recalcula juros e multa em vez de usar saldos antigos',()=>{
 const p={vencimento:new Date('2026-11-10T12:00:00Z'),restante:999,multa:999,juros:999};
 const m=text(p);assert.match(m,/2 dias/);assert.match(m,/Multa: R\$ 17,50/);assert.match(m,/Juros até hoje: R\$ 7,00/);assert.match(m,/Total atualizado: R\$ 374,50/);assert.doesNotMatch(m,/999/);
 const partial=text({...p,pago:100});assert.match(partial,/Já pago: R\$ 100,00/);assert.match(partial,/Total atualizado: R\$ 274,50/);
 const agreed=text({...p,pago:100,acordoSemEncargos:true});assert.match(agreed,/Total atualizado: R\$ 250,00/);assert.match(agreed,/Multa: R\$ 0,00/);
});
test('dia civil do país distingue Portugal e Brasil sem depender do computador',()=>{
 const p={...parcel,vencimento:new Date('2026-11-12T12:00:00Z')},instant=new Date('2026-11-13T01:00:00Z');
 assert.equal(prepararWhatsAppParcela(p,loan,instant).diasRestantes,0);
 assert.equal(prepararWhatsAppParcela(p,{...loan,pais:'PT',telefoneCliente:'351931714823'},instant).diasRestantes,-1);
 assert.match(text({vencimento:new Date('2026-11-10T12:00:00Z')},{pais:'PT',telefoneCliente:'351931714823'}),/€/);
});
test('não prepara dívida encerrada, quitada ou telefone inválido e não altera dados',()=>{
 const before=structuredClone(parcel);text();assert.deepEqual(parcel,before);
 assert.throws(()=>text({status:'pago'}));assert.throws(()=>text({pago:350}));assert.throws(()=>text({}, {telefoneCliente:''}));assert.throws(()=>text({}, {status:'quitado'}));
});
function fixture(notice){
 globalThis.document={addEventListener(){}};globalThis.alert=()=>{};
 let closed=false,url='';globalThis.window={open:()=>({opener:{},close(){closed=true;},location:{replace(v){url=v;}}})};
 const records=new Map([['parcelas/p',{...parcel,emprestimoId:'e',userId:'u'}],['emprestimos/e',{...loan,userId:'u'}],['promessasPagamento/parcela-p',notice]]);
 const api={db:{},now:()=>now,doc:(_,c,id)=>c+'/'+id,getDocFromServer:async ref=>({exists:()=>!!records.get(ref),data:()=>records.get(ref)})};
 return {panel:createPaymentFollowup(api),get closed(){return closed;},get url(){return url;}};
}
test('abrir contato prepara texto atual; promessa ativa fecha a aba sem navegar',async()=>{
 const allowed=fixture(null);assert.equal(await allowed.panel.openContact('p'),true);assert.match(allowed.url,/text=/);
 const key=new Date().toISOString().slice(0,10);const blocked=fixture({status:'ativa',data:key,pais:'PT'});assert.equal(await blocked.panel.openContact('p'),false);assert.equal(blocked.closed,true);assert.equal(blocked.url,'');
});
