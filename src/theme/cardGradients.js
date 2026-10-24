// Gradient treatments used to tell credit cards apart visually.

export const CARD_GRADIENTS = {
  ocean: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
  sunset: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)',
  emerald: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  violet: 'linear-gradient(135deg, #41295a 0%, #2f0743 100%)',
  rose: 'linear-gradient(135deg, #b24592 0%, #f15f79 100%)',
  graphite: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
  teal: 'linear-gradient(135deg, #136a8a 0%, #267871 100%)',
  copper: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)',
};

export const GRADIENT_KEYS = Object.keys(CARD_GRADIENTS);

/** Pick the first gradient not already used by another card, cycling if all are taken. */
export function nextGradientKey(cards) {
  const used = new Set(cards.map((c) => c.gradientKey));
  return GRADIENT_KEYS.find((k) => !used.has(k)) ?? GRADIENT_KEYS[cards.length % GRADIENT_KEYS.length];
}

export function gradientFor(key) {
  return CARD_GRADIENTS[key] ?? CARD_GRADIENTS.graphite;
}
