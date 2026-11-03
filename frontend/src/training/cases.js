import { casesOf } from '../catalog/index.js';
/**
 * Casos de OLL y PLL para el entrenamiento. No hay una lista propia: todo viene del catálogo central,
 * así que el entrenador, el almanaque y las estadísticas hablan siempre de los mismos casos.
 */


const label = (c) => {
  const alias = c.aliases.find((a) => a.verified);
  return alias ? `${c.name} · ${alias.name}` : c.name;
};

const view = (c) => ({
  id: c.id,
  set: c.set,
  name: label(c),
  family: c.category,
  alg: c.recommended.notation,
  verification: c.verification.level,
  catalogCase: c,
});

const cache = {};

/** Casos de una zona de entrenamiento ('oll' o 'pll'); null para las zonas que no trabajan con casos. */
export function casesForZone(zoneId) {
  if (zoneId !== 'oll' && zoneId !== 'pll') return null;
  return (cache[zoneId] ??= casesOf(zoneId.toUpperCase()).map(view));
}
export { label as caseLabel };