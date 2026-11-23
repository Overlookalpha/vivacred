import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {recuperarCredito,limitesRecuperacao} from '../functions/lib/recuperacaoCredito.mjs';
import {textoResumoLimite} from '../resumo-limite.mjs';
const {perfilCredito}=createRequire(import.meta.url)('../functions/lib/perfilCredito.js');
const cliente={pais:'BR',score:40};
const hoje=new Date('2026-11-23T15:00:00Z');
const paga=(v,p,extra={})=>({valor:100,pago:100,status:'pago',vencimento:v,dataPagamentoReal:p,...extra});
const atraso=paga('2026-01-01','2026-01-21');
const parcelas=n=>[atraso,...Array.from({length:n},(_,i)=>paga(`2026-${String(i+2).padStart(2,'0')}-10`,`2026-${String(i+2).padStart(2,'0')}-10`))];
test('recuperação em dia segue exemplo aprovado e nunca compõe a redução sobre limite já reduzido',()=>{
  for(const [n,nota,valor] of [[0,48,400],[1,51,400],[3,57,400],[4,60,600],[6,66,600],[9,75,800]]){
    const r=limitesRecuperacao(cliente,800,[],parcelas(n),hoje);
    assert.equal(r.nota,nota);assert.equal(r.disponivel,valor);assert.equal(r.normal,800);
  }
});
test('antecipação de 5 dias recupera 5; menos de 5 recupera 3; sem bônus duplo',()=>{
  const lista=[atraso,paga('2026-02-10','2026-02-05'),paga('2026-03-10','2026-03-06')];
  const r=recuperarCredito(cliente,[],lista,hoje);
  assert.equal(r.nota,56);assert.equal(r.pontosRecuperados,8);
  assert.equal(r.pontuaisRecuperacao,1);assert.equal(r.antecipadasRecuperacao,1);
});
test('pagamentos anteriores ou no dia de regularização não contam como recuperação posterior',()=>{
  const r=recuperarCredito(cliente,[],[paga('2025-12-10','2025-12-10'),atraso,paga('2026-01-21','2026-01-21')],hoje);
  assert.equal(r.nota,48);assert.equal(r.pontosRecuperados,0);
});
test('novo atraso encerra sequência de recuperação anterior e não dá bônus',()=>{
  const r=recuperarCredito(cliente,[],[...parcelas(2),paga('2026-04-01','2026-04-11')],hoje);
  assert.equal(r.nota,43);assert.equal(r.pontosRecuperados,0);
});
test('nenhum bônus enquanto existia outra parcela vencida, inclusive de outro empréstimo',()=>{
  const r=recuperarCredito(cliente,[],[atraso,paga('2026-03-10','2026-03-10'),paga('2026-02-01','2026-04-10')],hoje);
  assert.equal(r.pontosRecuperados,0);
  const aberto=limitesRecuperacao(cliente,800,[],[...parcelas(1),{valor:100,pago:0,vencimento:'2026-11-01',status:'pendente'}],hoje);
  assert.equal(aberto.disponivel,0);assert.equal(aberto.bloqueado,true);
});
test('promessa ativa não elimina atraso; altera-se apenas pelo vencimento real salvo',()=>{
  const p={valor:100,pago:0,status:'pendente',vencimento:'2026-11-01',promessaPagamento:{data:'2026-12-01'}};
  assert.equal(limitesRecuperacao(cliente,800,[],[p],hoje).disponivel,0);
  assert.equal(limitesRecuperacao(cliente,800,[],[{...p,vencimento:'2026-12-01'}],hoje).disponivel,800);
});
test('limite manual preservado; perda sempre exige revisão, sem apagar histórico',()=>{
  const c={...cliente,limiteManual:true,limiteBase:650};
  assert.equal(limitesRecuperacao(c,650,[],[atraso],hoje).disponivel,650);
  const r=limitesRecuperacao(c,650,[{status:'perdido'}],parcelas(9),hoje);
  assert.equal(r.nota,0);assert.equal(r.disponivel,0);assert.equal(r.perda,true);
});
test('sem datas reais não inventa recuperação; data futura e teste ignorados',()=>{
  const r=recuperarCredito(cliente,[],[atraso,paga('2026-02-01',null),paga('2026-12-01','2026-12-01'),paga('2026-03-01','2026-03-01',{teste:true})],hoje);
  assert.equal(r.nota,48);assert.equal(r.pontosRecuperados,0);assert.equal(r.semDataReal,2);
});
test('limite da nota respeita faixas, teto100, perdas e histórico independente da ordem',()=>{
  const list=[atraso,...Array.from({length:25},(_,i)=>paga('2026-10-10',`2026-09-${String(i+1).padStart(2,'0')}`))];
  const r=recuperarCredito(cliente,[],list,hoje);
  assert.equal(r.nota,100);assert.deepEqual(r,recuperarCredito(cliente,[],list.toReversed(),hoje));
  for(const [dias,nota] of [[1,82],[3,82],[4,68],[10,68],[11,48],[30,48],[31,28],[60,28],[61,10]]){
    const p=new Date(Date.UTC(2026,0,1+dias,12)).toISOString().slice(0,10);
    assert.equal(recuperarCredito(cliente,[],[paga('2026-01-01',p)],hoje).nota,nota);
  }
});
test('mensagens mostram normal, atual, redução e recuperação, inclusive bloqueios e Portugal',()=>{
  const p=limitesRecuperacao(cliente,800,[],[atraso],hoje),t=textoResumoLimite(p);
  assert.match(t.normal,/800/);assert.match(t.atual,/400/);assert.match(t.motivo,/50%/);
  assert.match(t.recuperacao,/3 pontos/);assert.match(t.recuperacao,/5 pontos/);
  assert.match(textoResumoLimite({...p,perda:true}).motivo,/revisão/);
  assert.match(textoResumoLimite(p,'PT').normal,/€/);
});
test('servidor isola IDs, suporta contrato legado único, deduplica e ignora testes',async()=>{
  const doc=(id,data)=>({id,data:()=>data});
  const tables={usuarios:[doc('u',{email:'u@test'})],emprestimos:[doc('a',{userId:'u'}),doc('b',{email:'u@test'}),doc('x',{userId:'outro',email:'u@test'}),doc('t',{userId:'u',teste:true})],parcelas:[doc('p',{...atraso,emprestimoId:'b'}),doc('v',{...atraso,emprestimoId:'a',userId:'outro'})]};
  const db={collection:name=>({where:(key,op,value)=>{const q={name,key,value,limit:()=>q};return q;}})};
  const leitor={get:async q=>({docs:tables[q.name].filter(d=>d.data()[q.key]===q.value)})};
  const r=await perfilCredito(db,leitor,'u',{...cliente,email:'u@test'},'BR','Bronze');
  assert.equal(r.nota,48);assert.equal(r.diasAcumulados,20);
  tables.usuarios.push(doc('dup',{email:'u@test'}));
  assert.equal((await perfilCredito(db,leitor,'u',{...cliente,email:'u@test'},'BR','Bronze')).nota,null);
});
test('cliente e servidor verificam mesmo perfil e retirada do bônus antigo',()=>{
  const server=readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
  assert.match(server,/const perfil = await perfilCredito\(db, tx, request.auth.uid/);
  assert.match(server,/const limite = perfil.disponivel/);
  assert.match(server,/exports.obterPerfilCredito = onCall/);
  const home=readFileSync(new URL('../home.html',import.meta.url),'utf8');
  assert.match(home,/limiteEfetivoGlobal = perfilPagamentos\?\.disponivel \?\? 0/);
  assert.match(home,/mostrarResumoLimite/);
  assert.doesNotMatch(readFileSync(new URL('../admin.html',import.meta.url),'utf8'),/score: scoreAtual \+ 5/);
});
