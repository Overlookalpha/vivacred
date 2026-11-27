import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {agruparParcelasEmprestimos} from '../carregamento-emprestimos.mjs';
test('índice preserva vínculo, id real e valores das parcelas de contratos diferentes',()=>{
 const rows=[{emprestimoId:'a',numero:2,valor:200,pago:20},{emprestimoId:'b',numero:1,valor:350,status:'pago'},{emprestimoId:'a',numero:1,valor:100},{valor:90}];
 const antes=JSON.stringify(rows),m=agruparParcelasEmprestimos(rows.map((r,i)=>({id:'p'+i,data:()=>r})));
 assert.equal(m.size,2);assert.deepEqual(m.get('a').map(p=>p.id),['p0','p2']);assert.equal(m.get('a')[0].pago,20);assert.equal(m.get('b')[0].valor,350);assert.equal(JSON.stringify(rows),antes);
});
test('lista reutiliza snapshots e não consulta parcelas dentro do laço de cartões',()=>{
 const html=readFileSync('admin.html','utf8');const lista=html.slice(html.indexOf('// EMPRÉSTIMOS ATIVOS'),html.indexOf('// ===== HISTÓRICO DE EMPRÉSTIMOS'));
 assert.doesNotMatch(lista,/await getDocs/);assert.match(lista,/const emprestimosSnap = snapshot/);assert.match(lista,/parcelasPorEmprestimoCards.get\(emprestimoDoc.id\)/);
});
