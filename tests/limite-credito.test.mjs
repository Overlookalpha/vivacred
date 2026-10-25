import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calcularNivel, limiteEfetivo } from '../perfil-credito.mjs';

const require = createRequire(import.meta.url);
const servidor = require('../functions/lib/limiteCredito.js');
const NIVEIS = [[0, 'Essencial'], [20, 'Essencial'], [21, 'Bronze'], [40, 'Bronze'], [41, 'Prata'], [60, 'Prata'], [61, 'Ouro'], [80, 'Ouro'], [81, 'Black'], [100, 'Black']];

test('cliente e servidor têm o mesmo limite por nível, nos dois países', () => {
  for (const pais of ['BR', 'PT']) {
    for (const [score, nome] of NIVEIS) {
      const nivel = calcularNivel(score, pais);
      assert.equal(nivel.nome, nome);
      assert.equal(servidor.LIMITES_POR_NIVEL[pais][nome], nivel.max, `${pais} ${nome}`);
      assert.equal(limiteEfetivo({ score, pais }), servidor.limiteEfetivo({ score }, pais, nome));
    }
  }
});

test('score ausente ou inválido é Essencial, nunca Black', () => {
  for (const score of [undefined, null, '', 'abc', NaN]) assert.equal(calcularNivel(score, 'BR').nome, 'Essencial');
});

test('limiteBase antigo sem limiteManual não reduz o limite do nível', () => {
  const cliente = { score: 70, pais: 'BR', limiteBase: 100 };
  assert.equal(limiteEfetivo(cliente), 3000);
  assert.equal(servidor.limiteEfetivo(cliente, 'BR', 'Ouro'), 3000);
});

test('limite manual do administrador vale no cliente e no servidor', () => {
  const cliente = { score: 70, pais: 'BR', limiteBase: 800, limiteManual: true };
  assert.equal(limiteEfetivo(cliente), 800);
  assert.equal(servidor.limiteEfetivo(cliente, 'BR', 'Ouro'), 800);
  for (const invalido of [0, -5, 'x', null]) assert.equal(limiteEfetivo({ ...cliente, limiteBase: invalido }), 3000);
});

test('prazo e juros iguais na simulação do cliente e no contrato do servidor', async () => {
  const { REGRAS_CREDITO } = await import('../perfil-credito.mjs');
  assert.deepEqual(servidor.REGRAS_CREDITO, REGRAS_CREDITO);
});

test('exemplo: R$ 250 em 8x no Ouro = 120% de juros', async () => {
  const { REGRAS_CREDITO } = await import('../perfil-credito.mjs');
  const taxa = REGRAS_CREDITO.Ouro.juros[8];
  assert.equal(Number((250 * taxa).toFixed(2)), 300);
  assert.equal(REGRAS_CREDITO.Essencial.maxParcelas, 2);
});
