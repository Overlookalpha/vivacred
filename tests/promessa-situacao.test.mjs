import test from 'node:test';
import assert from 'node:assert/strict';
import {resultadoPromessa} from '../acompanhamento-pagamento.mjs';
const now=new Date('2026-11-26T12:00:00Z'),loan={pais:'BR'},notice={status:'ativa',data:'2026-11-25',pais:'BR'};
const parcel={valor:350,pago:0,status:'pendente'};
test('distingue aguardando, hoje e vencida; parcial não cumpre promessa',()=>{
 assert.equal(resultadoPromessa({...notice,data:'2026-11-27'},parcel,loan,now).tipo,'aguardando');
 assert.match(resultadoPromessa({...notice,data:'2026-11-26'},parcel,loan,now).titulo,/hoje/);
 assert.equal(resultadoPromessa(notice,{...parcel,pago:100},loan,now).tipo,'vencida');
});
test('quitação no dia combinado cumpre, pagamento posterior não cumpre prazo',()=>{
 const paid={...parcel,status:'pago',pago:350,dataPagamentoReal:new Date('2026-11-25T20:00:00Z')};
 assert.equal(resultadoPromessa(notice,paid,loan,now).tipo,'cumprida');
 assert.equal(resultadoPromessa(notice,{...paid,dataPagamentoReal:'2026-11-26'},loan,now).tipo,'fora');
 assert.equal(resultadoPromessa(notice,{...paid,dataPagamentoReal:'2026-11-24'},loan,now).tipo,'cumprida');
});
test('confirmação administrativa e data futura não são prova da data real',()=>{
 const paid={...parcel,status:'pago',pago:350,pagoEm:now,dataPagamento:now};
 assert.equal(resultadoPromessa(notice,paid,loan,now).tipo,'conferir');
 for(const real of ['invalida','2026-02-30','2026-11-27'])assert.equal(resultadoPromessa(notice,{...paid,dataPagamentoReal:real},loan,now).tipo,'conferir');
});
test('perda, cancelamento ou data inválida não confirmam cumprimento',()=>{
 for(const status of ['perdido','cancelado'])assert.equal(resultadoPromessa(notice,{...parcel,status},loan,now).tipo,'conferir');
 assert.equal(resultadoPromessa({...notice,data:'errada'},parcel,loan,now).tipo,'conferir');
});
test('respeita dia civil do país para pagamento e prazo',()=>{
 const paid={...parcel,status:'pago',dataPagamentoReal:new Date('2026-11-26T01:00:00Z')};
 assert.equal(resultadoPromessa(notice,paid,{pais:'BR'},now).tipo,'cumprida');
 assert.equal(resultadoPromessa(notice,paid,{pais:'PT'},now).tipo,'fora');
});
