// Regra compartilhada com o cartão "Seu limite disponível" da área do usuário.
export function calcularNivel(score, pais = "BR") {

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
