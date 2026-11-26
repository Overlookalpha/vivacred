import test from 'node:test';
import assert from 'node:assert/strict';
import {corresponde,resumirVencimentos,validarTelefone,salvarTelefone,diasAte} from '../painel-emprestimos.mjs';
const now=new Date('2026-11-26T12:00:00Z');
const parcela=(dia,extra={})=>({valor:100,pago:0,status:'pendente',vencimento:new Date(`2026-11-${dia}T12:00:00Z`),...extra});
const item=(id,pais,pendentes,extra={})=>({id,emp:{nomeCliente:'João Corrêa',pais,userId:id,telefoneCliente:'+5551999991234',...extra},pendentes,pagas:0});
test('busca sem acentos e filtros combinados consideram todas as parcelas abertas',()=>{
 const x=item('a','BR',[parcela('25'),parcela('28')]);
 assert.ok(corresponde(x,{busca:'joao correa',prazo:'cinco',pais:'BR',pagamento:'sem'},now));
 assert.ok(corresponde(x,{prazo:'atrasado'},now));
 assert.ok(!corresponde(x,{pais:'PT'},now));
 assert.ok(!corresponde({...x,pagas:1},{pagamento:'sem'},now));
 assert.ok(!corresponde({...x,pendentes:[parcela('28',{pago:20})]},{pagamento:'sem'},now));
 assert.ok(corresponde({...item('q','BR',[]),quitado:true},{prazo:'quitado'},now));
});
test('resumo conta clientes únicos, separa moedas e soma juros, parcial e acordo corretamente',()=>{
 const items=[item('u','BR',[parcela('24'),parcela('26',{pago:40})]),item('u','BR',[parcela('25',{acordoSemEncargos:true})]),item('p','PT',[parcela('30'),parcela('30')])];
 const r=resumirVencimentos(items,now);
 assert.deepEqual(r.atrasado,{clientes:1,parcelas:2,BR:207,PT:0});
 assert.deepEqual(r.hoje,{clientes:1,parcelas:1,BR:60,PT:0});
 assert.deepEqual(r.cinco,{clientes:1,parcelas:2,BR:0,PT:200});
});
test('cinco dias exclui hoje e sexto dia; datas seguem o país e inválidas não somam',()=>{
 const x=item('a','BR',[parcela('26'),parcela('30',{vencimento:new Date('2026-12-01T12:00:00Z')}),parcela('30',{vencimento:new Date('2026-12-02T12:00:00Z')}),{valor:99,vencimento:null}]);
 assert.equal(resumirVencimentos([x],now).cinco.BR,100);
 const instant=new Date('2026-11-27T01:00:00Z');
 assert.equal(diasAte(parcela('26'),'BR',instant),0);assert.equal(diasAte(parcela('26'),'PT',instant),-1);
});
test('telefone requer indicativo e normaliza sem aceitar texto ou link',()=>{
 assert.equal(validarTelefone('+55 (51) 99820-8350','BR'),'+5551998208350');
 assert.equal(validarTelefone('351 931 714 823','PT'),'+351931714823');
 for(const value of ['51998208350','','https://wa.me/5551998208350','+55abc51998208350'])assert.throws(()=>validarTelefone(value,'BR'));
 assert.throws(()=>validarTelefone('+5551998208350','PT'));
});
function fixture({admin=true,changed=false,profileChanged=false}={}){
 const x=item('u','BR',[]);x.id='loan';x.telefoneCadastro='+5551999991234';
 const records=new Map([['admins/a',admin?{}:null],['emprestimos/loan',{...x.emp,telefoneCliente:changed?'outro':x.emp.telefoneCliente}],['usuarios/u',{telefone:profileChanged?'outro':x.telefoneCadastro}]]);
 const writes=[];let writing=false;
 const api={auth:{currentUser:{uid:'a'}},db:{},doc:(_,c,id)=>c+'/'+id,runTransaction:async(_,fn)=>fn({get:async key=>{assert.equal(writing,false);return {exists:()=>records.get(key)!=null,data:()=>records.get(key)};},update:(key,patch)=>{writing=true;writes.push([key,patch]);}})};
 return {api,x,writes};
}
test('salva atomicamente apenas contacto no empréstimo e cadastro',async()=>{
 const {api,x,writes}=fixture();assert.equal(await salvarTelefone(api,x,'+5551998208350'),'+5551998208350');
 assert.deepEqual(writes,[['emprestimos/loan',{telefoneCliente:'+5551998208350'}],['usuarios/u',{telefone:'+5551998208350'}]]);
});
test('falha de autorização ou contacto alterado impede gravações',async()=>{
 for(const options of [{admin:false},{changed:true},{profileChanged:true}]){const {api,x,writes}=fixture(options);await assert.rejects(salvarTelefone(api,x,'+5551998208350'));assert.equal(writes.length,0);}
});
