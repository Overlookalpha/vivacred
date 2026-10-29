import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {runInThisContext} from 'node:vm';
import {registrarPagamentoSaque} from '../saque-pagamento.mjs';
const enabled=!!process.env.VIVACRED_RULES_TEST_PACKAGE;
let env,api,assertFails,assertSucceeds;
const check=(name,fn)=>test(name,{skip:!enabled},fn);
before(async()=>{
 if(!enabled)return;
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:18088')throw Error('Somente emulador isolado 18088.');
 const require=createRequire(process.env.VIVACRED_RULES_TEST_PACKAGE);
 const rules=require('@firebase/rules-unit-testing');api=require('firebase/firestore');
 ({assertFails,assertSucceeds}=rules);
 env=await rules.initializeTestEnvironment({projectId:'demo-vivacred-isacoins',firestore:{host:'127.0.0.1',port:18088,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{if(env)await env.clearFirestore();});
async function seed({reserved=true,paid=false,saldo=12}={}){
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await Promise.all([
   api.setDoc(api.doc(db,'admins','admin-test'),{role:'admin'}),
   api.setDoc(api.doc(db,'usuarios','u1'),{isaCoins:saldo,isaCoinsReservadas:reserved?10000:0,isaCoinsSacadas:0}),
   api.setDoc(api.doc(db,'saques','s1'),{userId:'u1',pais:'BR',isaCoins:10000,valor:100,status:paid?'pago':'pendente',...(reserved?{moedasReservadas:true,versaoMoedas:2}:{})}),
   api.setDoc(api.doc(db,'configuracoes','financeiro'),{impactoCaixaBR:1000})]);
 });
}
const admin=()=>env.authenticatedContext('admin-test').firestore();
const pay=db=>registrarPagamentoSaque({db,id:'s1',...api});
async function oldBatch(db,{reserved=false,changedValue=false}={}){
 const batch=api.writeBatch(db);
 batch.update(api.doc(db,'usuarios','u1'),{isaCoins:0,isaCoinsSacadas:10000});
 batch.update(api.doc(db,'saques','s1'),{status:'pago',pagoEm:api.serverTimestamp(),...(changedValue?{valor:1}:{})});
 batch.set(api.doc(db,'configuracoes','financeiro'),{impactoCaixaBR:api.increment(-100)},{merge:true});
 batch.set(api.doc(db,'movimentacoesCaixa','random-old-id'),{saqueId:'s1',valor:-100});
 return batch.commit();
}
check('emulador: baixa V2 deixa12 moedas e registra caixa exatamente uma vez',async()=>{
 await seed();const db=admin();await assertSucceeds(pay(db));
 assert.equal((await api.getDoc(api.doc(db,'usuarios','u1'))).data().isaCoins,12);
 assert.equal((await api.getDoc(api.doc(db,'usuarios','u1'))).data().isaCoinsReservadas,0);
 assert.equal((await api.getDoc(api.doc(db,'configuracoes','financeiro'))).data().impactoCaixaBR,900);
 assert.equal((await pay(db)).jaPago,true);
});
check('emulador: duas transações concorrentes não duplicam baixa nem caixa',async()=>{
 await seed();const db=admin();const results=await Promise.all([pay(db),pay(db)]);
 assert.equal(results.filter(r=>r.jaPago).length,1);
 assert.equal((await api.getDoc(api.doc(db,'configuracoes','financeiro'))).data().impactoCaixaBR,900);
});
check('emulador: aba antiga é rejeitada atomicamente sem consumir12 moedas',async()=>{
 await seed();const db=admin();await assertFails(oldBatch(db,{reserved:true}));
 assert.equal((await api.getDoc(api.doc(db,'usuarios','u1'))).data().isaCoins,12);
 assert.equal((await api.getDoc(api.doc(db,'saques','s1'))).data().status,'pendente');
 assert.equal((await api.getDoc(api.doc(db,'configuracoes','financeiro'))).data().impactoCaixaBR,1000);
});
check('emulador: pedido legado ainda pode ser baixado pela versão nova',async()=>{
 await seed({reserved:false,saldo:10012});const db=admin();await assertSucceeds(pay(db));
 assert.equal((await api.getDoc(api.doc(db,'usuarios','u1'))).data().isaCoins,12);
});
check('emulador: usuário comum não confirma saque ou consulta outro cliente',async()=>{
 await seed();const db=env.authenticatedContext('u1').firestore();
 await assertFails(pay(db));await assertFails(api.getDoc(api.doc(db,'usuarios','outro')));
 await assertSucceeds(api.getDoc(api.doc(db,'usuarios','u1')));
 await assertFails(api.updateDoc(api.doc(db,'usuarios','u1'),{isaCoins:99999}));
});
check('emulador: não autenticado não lê saques; consulta do dono funciona',async()=>{
 await seed();await assertFails(api.getDocs(api.collection(env.unauthenticatedContext().firestore(),'saques')));
 const db=env.authenticatedContext('u1').firestore();
 const rows=await assertSucceeds(api.getDocs(api.query(api.collection(db,'saques'),api.where('userId','==','u1'))));assert.equal(rows.size,1);
});
check('emulador: regravação de pago e troca de valor são bloqueadas',async()=>{
 await seed({paid:true});await assertFails(oldBatch(admin()));
 await seed();await assertFails(oldBatch(admin(),{changedValue:true}));
});
check('emulador: reserva pendente não pode ser apagada ou criada pelo cliente',async()=>{
 await seed();await assertFails(api.deleteDoc(api.doc(admin(),'saques','s1')));
 const db=env.authenticatedContext('u1').firestore();await assertFails(api.setDoc(api.doc(db,'saques','fake'),{userId:'u1',isaCoins:10000,valor:100,pais:'BR',status:'pendente'}));
});
check('emulador: saldo em tempo real chega ao cliente durante baixa administrativa',async()=>{
 await seed();const db=env.authenticatedContext('u1').firestore();
 let stop;const observed=new Promise((resolve,reject)=>{stop=api.onSnapshot(api.doc(db,'usuarios','u1'),snap=>{const u=snap.data();if(u?.isaCoinsReservadas===0)resolve(u);},reject);});
 await pay(admin());const u=await observed;stop();assert.equal(u.isaCoins,12);assert.equal(u.isaCoinsSacadas,10000);
});
check('emulador: handler real reserva10000 uma vez, duas solicitações não duplicam saldo',async()=>{
 await seed({reserved:false,saldo:10012});
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();await api.deleteDoc(api.doc(db,'saques','s1'));
  await api.updateDoc(api.doc(db,'usuarios','u1'),{pais:'BR',pix:'TESTE-SINTETICO',nome:'Cliente Sintético'});
 });
 const localRequire=createRequire(new URL('../functions/package.json',import.meta.url));
 const sdk=localRequire('firebase-admin/app'),firestore=localRequire('firebase-admin/firestore');
 const app=sdk.initializeApp({projectId:'demo-vivacred-isacoins'},'saque-emulador');
 try{
  const backend=firestore.getFirestore(app),exports={};
  class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
  const load=runInThisContext('(function(exports,require){'+await readFile(new URL('../functions/index.js',import.meta.url),'utf8')+'\n})');
  load(exports,function(name){
   if(name==='firebase-functions/v2/https')return {onCall:(_,fn)=>fn,HttpsError};
   if(name==='firebase-admin/firestore')return {...firestore,getFirestore:()=>backend};
   if(name==='firebase-admin/app')return {getApps:()=>[app]};
   return localRequire(name);
  });
  const outcomes=await Promise.allSettled([exports.solicitarSaque({auth:{uid:'u1'}}),exports.solicitarSaque({auth:{uid:'u1'}})]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1,JSON.stringify(outcomes.map(x=>({status:x.status,code:x.reason?.code,error:x.reason?.message}))));
  const u=(await backend.doc('usuarios/u1').get()).data();assert.equal(u.isaCoins,12);assert.equal(u.isaCoinsReservadas,10000);
  const requests=await backend.collection('saques').get();assert.equal(requests.size,1);assert.equal(requests.docs[0].data().valor,100);assert.equal(requests.docs[0].data().isaCoins,10000);
 }finally{await sdk.deleteApp(app);}
});
