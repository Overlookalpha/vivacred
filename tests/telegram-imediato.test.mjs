import {test} from 'node:test';
import assert from 'node:assert/strict';
import mod from '../functions/lib/telegramImediato.js';
function fixture(tipo='pagamento_aberto'){
 let state={tipoTelegram:tipo,criadoPor:'u',dadosTelegram:{id:'p'},data:{toDate:()=>new Date()},statusTelegram:'pendente'};
 let sends=0;
 const ref={id:'e',update:async p=>Object.assign(state,p)};
 const db={runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>({...state})}),update:(r,p)=>Object.assign(state,p)}),collection:c=>({doc:id=>({get:async()=>({exists:true,data:()=>c==='usuarios'?{nome:'Cliente',telefone:'000'}:{userId:'u',valor:100,restante:0,numero:1}})})})};
 return {state,db,ref,FieldValue:{serverTimestamp:()=>1,delete:()=>null},token:'token',chatId:'chat',fetchImpl:async()=>{sends++;return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:7}})};},get sends(){return sends;}};
}
test('aviso imediato entrega uma vez e não confirma pagamento',async()=>{
 const f=fixture();let body;const real=f.fetchImpl;f.fetchImpl=async(u,o)=>{body=JSON.parse(o.body);return real();};
 assert.deepEqual(await mod.entregar(f),{enviado:true});assert.equal(f.state.statusTelegram,'enviado');
 assert.match(body.text,/NÃO confirma pagamento/);assert.match(body.text,/0,00/);
 await mod.entregar(f);assert.equal(f.sends,1);
});
test('falha mantém fila de recuperação sem vazar segredo',async()=>{
 const f=fixture();f.fetchImpl=async()=>{throw Error('token connection');};
 assert.deepEqual(await mod.entregar(f),{pendente:true});assert.equal(f.state.statusTelegram,'pendente');assert.ok(!f.state.erroTelegram.includes('token'));
});
test('não envia resumo diário ou evento administrativo',async()=>{
 const f=fixture('admin_texto');assert.deepEqual(await mod.entregar(f),{ignorado:true});assert.equal(f.sends,0);
});

test('evento antigo n�o � enviado pelo emissor imediato',async()=>{
 const f=fixture();f.state.data={toDate:()=>new Date('2026-01-01')};
 assert.deepEqual(await mod.entregar(f),{ignorado:true});assert.equal(f.sends,0);assert.equal(f.state.statusTelegram,'expirado');
});
