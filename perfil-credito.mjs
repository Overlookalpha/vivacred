// Regra compartilhada com o cartão "Seu limite disponível" da área do usuário.
export function calcularNivel(scoreBruto, pais = "BR") {

  // Score ausente ou inválido é sempre o nível inicial (igual ao servidor).
  const numero = Number(scoreBruto);
  const score = Number.isFinite(numero) ? numero : 0;

  const limites = pais === "PT"
  ? {
      Essencial: 100,
      Bronze: 300,
      Prata: 500,
      Ouro: 800,
      Black: 2000
    }
  : {
      Essencial: 300,
      Bronze: 800,
      Prata: 1500,
      Ouro: 3000,
      Black: 5000
    };

  if (score <= 20) {
    return {
      nome: "Essencial",
      emoji: "🍀",
      max: limites.Essencial,
      cor: "#3F9142"
    };
  }
  else if (score <= 40) {
    return {
      nome: "Bronze",
      emoji: "🥉",
      max: limites.Bronze,
      cor: "#A5652A"
    };
  }
  else if (score <= 60) {
    return {
      nome: "Prata",
      emoji: "🥈",
      max: limites.Prata,
      cor: "#6B7280"
    };
  }
  else if (score <= 80) {
    return {
      nome: "Ouro",
      emoji: "🥇",
      max: limites.Ouro,
      cor: "#B7791F"
    };
  }
  else {
    return {
      nome: "Black",
      emoji: "💎",
      max: limites.Black,
      cor: "#5B21B6"
    };
  }

}

// Limite que realmente vale para o cliente: o do nível dele, a menos que o
// administrador tenha definido um limite manual (limiteManual === true).
// O servidor (functions/index.js) aplica exatamente esta regra.
export function limiteEfetivo(cliente, pais) {
  const nivel = calcularNivel(cliente?.score, pais || cliente?.pais || "BR");
  const manual = Number(cliente?.limiteBase);
  if (cliente?.limiteManual === true && Number.isFinite(manual) && manual > 0) return manual;
  return nivel.max;
}

// Prazo máximo e juros (percentual único sobre o valor) de cada nível.
// O servidor usa a mesma tabela (functions/lib/limiteCredito.js).
export const REGRAS_CREDITO = {
  Essencial: { maxParcelas: 2, juros: { 1: 0.35, 2: 0.60 } },
  Bronze: { maxParcelas: 4, juros: { 1: 0.30, 2: 0.45, 3: 0.60, 4: 0.75 } },
  Prata: { maxParcelas: 6, juros: { 1: 0.25, 2: 0.40, 3: 0.55, 4: 0.70, 5: 0.85, 6: 1.00 } },
  Ouro: { maxParcelas: 8, juros: { 1: 0.20, 2: 0.30, 3: 0.45, 4: 0.60, 5: 0.75, 6: 0.90, 7: 1.05, 8: 1.20 } },
  Black: { maxParcelas: 12, juros: { 1: 0.15, 2: 0.25, 3: 0.35, 4: 0.45, 5: 0.55, 6: 0.65, 7: 0.75, 8: 0.85, 9: 0.95, 10: 1.10, 11: 1.25, 12: 1.40 } }
};
