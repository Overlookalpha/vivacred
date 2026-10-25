"use strict";

// Limites por nível. Espelha perfil-credito.mjs (a tela do cliente e o admin);
// tests/limite-credito.test.mjs garante que as duas tabelas não divergem.
const LIMITES_POR_NIVEL = {
  BR: { Essencial: 300, Bronze: 800, Prata: 1500, Ouro: 3000, Black: 5000 },
  PT: { Essencial: 100, Bronze: 300, Prata: 500, Ouro: 800, Black: 2000 }
};

// Vale o limite do nível, salvo limite manual definido pelo administrador.
function limiteEfetivo(usuario, pais, nivel) {
  const manual = Number(usuario.limiteBase);
  if (usuario.limiteManual === true && Number.isFinite(manual) && manual > 0) return manual;
  return LIMITES_POR_NIVEL[pais][nivel];
}

// Prazo e juros (percentual único sobre o valor) por nível. Espelha perfil-credito.mjs,
// que é a tabela exibida ao cliente; o contrato grava exatamente estes valores.
const REGRAS_CREDITO = {
  Essencial: { maxParcelas: 2, juros: { 1: 0.35, 2: 0.60 } },
  Bronze: { maxParcelas: 4, juros: { 1: 0.30, 2: 0.45, 3: 0.60, 4: 0.75 } },
  Prata: { maxParcelas: 6, juros: { 1: 0.25, 2: 0.40, 3: 0.55, 4: 0.70, 5: 0.85, 6: 1.00 } },
  Ouro: { maxParcelas: 8, juros: { 1: 0.20, 2: 0.30, 3: 0.45, 4: 0.60, 5: 0.75, 6: 0.90, 7: 1.05, 8: 1.20 } },
  Black: { maxParcelas: 12, juros: { 1: 0.15, 2: 0.25, 3: 0.35, 4: 0.45, 5: 0.55, 6: 0.65, 7: 0.75, 8: 0.85, 9: 0.95, 10: 1.10, 11: 1.25, 12: 1.40 } }
};

module.exports = { LIMITES_POR_NIVEL, REGRAS_CREDITO, limiteEfetivo };
