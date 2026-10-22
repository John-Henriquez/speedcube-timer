/**
 * Casos de última capa. Cada algoritmo está verificado por tests contra el modelo
 * del cubo: no altera las dos primeras capas y resuelve exactamente el caso que
 * genera su inverso. `edges` es el patrón de aristas esperado del caso.
 *
 * Pendientes (necesitan movimientos anchos o rotaciones, aún no soportados):
 *   OLL 2-look: punto, T y L de esquinas.  PLL 2-look: Z.
 */
export const OLL_CASES = [
  { id: 'oll-linea', name: 'Línea', family: 'Aristas', alg: "F R U R' U' F'", edges: 'linea' },
  { id: 'oll-l', name: 'L', family: 'Aristas', alg: "F U R U' R' F'", edges: 'L' },
  { id: 'oll-sune', name: 'Sune', family: 'Esquinas', alg: "R U R' U R U2 R'", edges: 'cruz' },
  { id: 'oll-antisune', name: 'Antisune', family: 'Esquinas', alg: "R U2 R' U' R U' R'", edges: 'cruz' },
  { id: 'oll-pi', name: 'Pi', family: 'Esquinas', alg: "R U2 R2 U' R2 U' R2 U2 R", edges: 'cruz' },
  { id: 'oll-h', name: 'H', family: 'Esquinas', alg: "R U R' U R U' R' U R U2 R'", edges: 'cruz' },
  { id: 'oll-u', name: 'U', family: 'Esquinas', alg: "R2 D R' U2 R D' R' U2 R'", edges: 'cruz' },
];

export const PLL_CASES = [
  { id: 'pll-aa', name: 'Aa', family: 'Esquinas', alg: "R' F R' B2 R F' R' B2 R2" },
  { id: 'pll-y', name: 'Y', family: 'Esquinas y aristas', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { id: 'pll-ua', name: 'Ua', family: 'Aristas', alg: "R U' R U R U R U' R' U' R2" },
  { id: 'pll-ub', name: 'Ub', family: 'Aristas', alg: "R2 U R U R' U' R' U' R' U R'" },
  { id: 'pll-h', name: 'H', family: 'Aristas', alg: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2" },
];
