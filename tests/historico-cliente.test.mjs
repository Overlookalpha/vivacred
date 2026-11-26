import test from 'node:test';
import assert from 'node:assert/strict';
import {selecionarHistorico,resumoHistorico,carregarHistoricoCliente,diaHistorico} from '../historico-cliente.mjs';
const now=new Date('2026-11-26T12:00:00Z');
const user={nome:'Teste',email:'teste@example.invalid',pais:'BR',score:45};
const loan=(id,extra={})=>({id,userId:'u',pais:'BR',status:'ativo',valor:100,valorFinal:120,...extra});
const parcel=(id,extra={})=>({id,emprestimoId:'e',userId:'u',numero:1,valor:120,pago:0,status:'pendente',vencimento:new Date('2026-11-20T12:00:00Z'),...extra});
test('não mistura clientes com o mesmo email e inclui legado apenas com identidade única',()=>{
 const loans=[loan('e'),loan('outro',{userId:'x',email:user.email}),loan('legado',{userId:null,email:user.email}),loan('teste',{teste:true})];
 const ps=[parcel('p'),parcel('foreign',{userId:'x'}),parcel('legado',{emprestimoId:'legado',userId:null})];
 assert.deepEqual(selecionarHistorico('u',user,loans,ps,false).contratos.map(x=>x.id),['e']);
 const result=selecionarHistorico('u',user,loans,ps,true);assert.deepEqual(result.contratos.map(x=>x.id),['e','legado']);assert.deepEqual(result.parcelas.map(x=>x.id),['p','legado']);
});
test('separa moedas, juros recebidos e calculados sem dupla contagem; inclui arquivados',()=>{
 const loans=[loan('e',{arquivado:true}),loan('pt',{pais:'PT',valor:80}),loan('rejeitado',{status:'rejeitado',valor:999})];
 const ps=[parcel('p',{pago:120,status:'pago',juros:99,jurosPagos:3,multaPaga:2,dataPagamentoReal:'2026-11-21'}),parcel('pt',{emprestimoId:'pt',valor:100,pago:30}),parcel('open',{numero:2})];
 const r=resumoHistorico(user,loans,ps,now);
 assert.equal(r.totais.BR.liberado,100);assert.equal(r.totais.PT.liberado,80);
 assert.equal(r.totais.BR.recebido,120);assert.equal(r.totais.BR.juros,3);assert.equal(r.totais.BR.multa,2);
 assert.equal(r.totais.PT.recebido,30);assert.equal(r.totais.PT.juros,0);assert.equal(r.totais.PT.semDiscriminacao,1);
 assert.equal(r.linhas[0].atrasoDias,1);assert.equal(r.totais.BR.aberto,133.2);
});
test('pagamentos sem data real não presumem atraso ou recuperação',()=>{
 const r=resumoHistorico(user,[loan('e')],[parcel('p',{status:'pago',pago:120,pagoEm:now})],now);
 assert.equal(r.linhas[0].pagamentoRealDia,null);assert.equal(r.linhas[0].atrasoDias,null);assert.equal(r.credito.semDataReal,1);
 assert.equal(diaHistorico(null),null);assert.equal(diaHistorico('2026-02-30'),null);
});
test('usa recuperação existente para pagamento pontual posterior ao último atraso',()=>{
 const ps=[parcel('p',{status:'pago',pago:120,vencimento:new Date('2026-09-01T12:00:00Z'),dataPagamentoReal:'2026-09-10'}),parcel('q',{status:'pago',pago:120,vencimento:new Date('2026-10-01T12:00:00Z'),dataPagamentoReal:'2026-10-01'})];
 const r=resumoHistorico(user,[loan('e')],ps,now);assert.equal(r.credito.pontosRecuperados,3);assert.equal(r.credito.pontuaisRecuperacao,1);
});
test('consulta apenas dados de leitura e sinaliza falha de histórico complementar',async()=>{
 const collections={usuarios:[{...user,id:'u'}],emprestimos:[loan('e')],parcelas:[parcel('p')]};
 const snap=arr=>({docs:arr.map(d=>({id:d.id,data:()=>d}))});
 const api={db:{},now:()=>now,doc:(_,c,id)=>[c,id],collection:(_,c)=>c,where:(field,op,value)=>({field,value}),query:(collection,filter)=>({collection,filter}),getDocFromServer:async()=>({exists:()=>true,data:()=>user}),getDocsFromServer:async({collection,filter})=>{if(collection==='historicoCobrancas')throw Error('offline');return snap((collections[collection]||[]).filter(d=>d[filter.field]===filter.value));}};
 const result=await carregarHistoricoCliente(api,'u');assert.equal(result.contratos.length,1);assert.equal(result.parcelas.length,1);assert.ok(result.warnings.some(w=>w.includes('historicoCobrancas')));
});
