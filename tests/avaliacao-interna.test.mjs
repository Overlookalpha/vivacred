import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliarCliente, criarIndiceAvaliacoes, avaliacaoHTML } from '../avaliacao-interna.mjs';
import { calcularNivel } from '../perfil-credito.mjs';

const hoje = new Date(2026, 9, 19, 12);
const cliente = { score: 100, limiteBase: 5000, pais: 'BR' };
const parcela = (atraso, extra = {}) => ({ valor: 1000, pago: 1000,
  vencimento: new Date(2026, 7, 1),
  dataPagamentoReal: new Date(2026, 7, 1 + atraso), ...extra });
const doc = (id, valor) => ({ id, data: () => valor });

test('faixas propostas mantêm ou reduzem somente a sugestão', () => {
  for (const [dias, nota, sugestao] of [[0,95,5000],[3,82,5000],[4,68,3750],
    [10,68,3750],[11,48,2500],[30,48,2500],[31,28,1250],[60,28,1250],[61,10,0]]) {
    const resultado = avaliarCliente(cliente, [], [parcela(dias)], hoje);
    assert.equal(resultado.nota, nota, `nota com ${dias} dias`);
    assert.equal(resultado.sugerido, sugestao);
    assert.equal(cliente.limiteBase, 5000);
  }
});

test('sem histórico e pagamentos sem data real não produzem nota otimista', () => {
  for (const parcelas of [[], [parcela(0, { dataPagamentoReal: null, pagoEm: hoje })],
    [parcela(0, { pago: 0, vencimento: new Date(2026,10,1) })]]) {
    const resultado = avaliarCliente(cliente, [], parcelas, hoje);
    assert.equal(resultado.nota, null);
    assert.equal(resultado.sugerido, null);
  }
});

test('atraso em aberto e pagamento parcial entram no demonstrativo', () => {
  const resultado = avaliarCliente(cliente, [{status:'ativo',valor:3000}], [
    parcela(0, { pago: 200, vencimento: new Date(2026,8,19) })], hoje);
  assert.equal(resultado.maiorAtrasoAtual, 30);
  assert.equal(resultado.concluidas, 0);
  assert.equal(resultado.nota, 38);
  assert.equal(resultado.sugerido, 1250);
  assert.equal(resultado.totalPago, 200);
  assert.equal(resultado.saldoVencido, 800);
  assert.equal(resultado.totalContratado, 3000);
});

test('reincidência pesa e recuperação exige pagamentos comprovados', () => {
  const recorrente = avaliarCliente(cliente, [], Array.from({length:10}, () => parcela(10)), hoje);
  assert.equal(recorrente.nota, 53);
  const recuperado = avaliarCliente(cliente, [], [parcela(30), ...Array.from({length:9}, () => parcela(0))], hoje);
  assert.equal(recuperado.nota, 51);
  assert.equal(recuperado.sugerido, 2500);
});

test('perda recomenda revisão mesmo com outros pagamentos pontuais', () => {
  const resultado = avaliarCliente(cliente, [{status:'perdido',valor:3000}], [parcela(0)], hoje);
  assert.equal(resultado.nota, 0);
  assert.equal(resultado.sugerido, 0);
  assert.match(avaliacaoHTML(resultado), /Revisar antes de liberar/);
});

test('usa o limite da área do usuário mesmo quando o cadastro diverge', () => {
  const resultado = avaliarCliente({score:100,limiteBase:100,pais:'BR'}, [], [parcela(30)], hoje);
  assert.equal(resultado.limiteAtual, 5000);
  assert.equal(resultado.sugerido, 2500);
  assert.equal(avaliarCliente({score:20,limiteBase:5000}, [], [parcela(0)], hoje).limiteAtual, 300);
  assert.equal(avaliarCliente({limiteBase:5000}, [], [parcela(0)], hoje).sugerido, null);
  assert.equal(avaliarCliente({score:'inválido',limiteBase:5000}, [], [parcela(0)], hoje).limiteAtual, null);
});

test('limites de Portugal também seguem o perfil exibido ao usuário', () => {
  const resultado = avaliarCliente({score:80,limiteBase:100,pais:'PT'}, [], [parcela(30)], hoje);
  assert.equal(resultado.sugerido, 400);
  assert.match(avaliacaoHTML(resultado), /€/);
});

test('todas as faixas usam a mesma função da área do usuário', () => {
  const limites = {BR:[300,800,1500,3000,5000], PT:[100,300,500,800,2000]};
  for (const pais of ['BR','PT']) {
    for (const [score, faixa] of [[1,0],[20,0],[21,1],[40,1],[41,2],[60,2],[61,3],[80,3],[81,4],[100,4]]) {
      const resultado = avaliarCliente({score,pais,limiteBase:1}, [], [parcela(30)], hoje);
      assert.equal(resultado.limiteAtual, limites[pais][faixa]);
      assert.equal(resultado.limiteAtual, calcularNivel(score,pais).max);
      assert.equal(resultado.sugerido, limites[pais][faixa] * 0.5);
    }
  }
  const home = readFileSync(new URL('../home.html',import.meta.url),'utf8');
  assert.match(home, /import \{ calcularNivel(, limiteEfetivo)?(, REGRAS_CREDITO)? \} from "\.\/perfil-credito\.mjs"/);
  assert.doesNotMatch(home, /function calcularNivel\(/);
});

test('ignora registros de teste e vencimentos inválidos', () => {
  const resultado = avaliarCliente(cliente, [{teste:true,status:'perdido',valor:3000}],
    [parcela(60, {teste:true}), parcela(0, {vencimento:'inválido'})], hoje);
  assert.equal(resultado.nota, null);
  assert.equal(resultado.totalContratado, 0);
  assert.equal(resultado.semVencimento, 1);
});

test('não mistura clientes: ID prevalece sobre e-mail e fallback exige e-mail único', () => {
  const usuarios = [doc('a',{...cliente,email:'a@exemplo.com'}),doc('b',{...cliente,email:'b@exemplo.com'})];
  const emprestimos = [doc('e1',{userId:'a',email:'b@exemplo.com',status:'ativo',valor:3000}),
    doc('e2',{email:'b@exemplo.com',status:'ativo',valor:1000}),
    doc('e3',{userId:'a',teste:true,status:'perdido'})];
  const parcelas = [doc('p1',{...parcela(30),emprestimoId:'e1'}),
    doc('p2',{...parcela(0),emprestimoId:'e2'}),doc('p3',{...parcela(90),emprestimoId:'e3'})];
  const resultado = criarIndiceAvaliacoes(usuarios,emprestimos,parcelas,hoje);
  assert.equal(resultado.porId.get('a').nota,48);
  assert.equal(resultado.porId.get('b').nota,95);
  const ambiguo = criarIndiceAvaliacoes([doc('a',{...cliente,email:'igual'}),doc('b',{...cliente,email:'igual'})],
    [doc('e',{email:'igual',status:'perdido'})],[],hoje);
  assert.equal(ambiguo.porEmail.has('igual'),false);
  assert.equal(ambiguo.porId.get('a').nota,null);
});

test('avaliação não modifica entradas nem integra tela do cliente', () => {
  const pessoa = Object.freeze({...cliente});
  const contrato = Object.freeze({status:'ativo',valor:3000});
  const item = Object.freeze(parcela(30));
  assert.doesNotThrow(() => avaliarCliente(pessoa,[contrato],[item],hoje));
  assert.doesNotMatch(readFileSync(new URL('../home.html',import.meta.url),'utf8'), /avaliacao-interna\.mjs/);
  const modulo = readFileSync(new URL('../avaliacao-interna.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(modulo, /updateDoc|setDoc|fetch\(|localStorage|firebase/);
  const admin = readFileSync(new URL('../admin.html',import.meta.url),'utf8');
  for (const trecho of ['demonstrativoCliente(dados)', 'demonstrativoCliente(emp)',
    'avaliacaoHTML(indiceClientes.porId.get(id))', 'avaliacaoHTML(avaliacaoPerfil)']) {
    assert.ok(admin.includes(trecho), trecho);
  }
});
