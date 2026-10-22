/**
 * Modelo del cubo 3x3 a nivel de piezas (8 esquinas + 12 aristas).
 * Sin rotaciones del cubo: los centros son fijos. Lógica pura, sin React.
 * Tablas de movimientos según la convención de Kociemba.
 */
export const CORNERS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
export const EDGES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];
export const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };

const C = (s) => s.split(' ').map((n) => CORNERS.indexOf(n));
const E = (s) => s.split(' ').map((n) => EDGES.indexOf(n));
const Z8 = [0, 0, 0, 0, 0, 0, 0, 0];
const Z12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// Un cuarto de vuelta horario de cada cara.
const QUARTER = {
  U: { cp: C('UBR URF UFL ULB DFR DLF DBL DRB'), co: Z8, ep: E('UB UR UF UL DR DF DL DB FR FL BL BR'), eo: Z12 },
  R: { cp: C('DFR UFL ULB URF DRB DLF DBL UBR'), co: [2, 0, 0, 1, 1, 0, 0, 2], ep: E('FR UF UL UB BR DF DL DB DR FL BL UR'), eo: Z12 },
  F: { cp: C('UFL DLF ULB UBR URF DFR DBL DRB'), co: [1, 2, 0, 0, 2, 1, 0, 0], ep: E('UR FL UL UB DR FR DL DB UF DF BL BR'), eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  D: { cp: C('URF UFL ULB UBR DLF DBL DRB DFR'), co: Z8, ep: E('UR UF UL UB DF DL DB DR FR FL BL BR'), eo: Z12 },
  L: { cp: C('URF ULB DBL UBR DFR UFL DLF DRB'), co: [0, 1, 2, 0, 0, 2, 1, 0], ep: E('UR UF BL UB DR DF FL DB FR UL DL BR'), eo: Z12 },
  B: { cp: C('URF UFL UBR DRB DFR DLF ULB DBL'), co: [0, 0, 1, 2, 0, 0, 2, 1], ep: E('UR UF UL BR DR DF DL BL FR FL UB DB'), eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
};

export function solvedState() {
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [...Z8], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [...Z12] };
}

function applyQuarter(s, face) {
  const m = QUARTER[face];
  return {
    cp: m.cp.map((from) => s.cp[from]),
    co: m.cp.map((from, i) => (s.co[from] + m.co[i]) % 3),
    ep: m.ep.map((from) => s.ep[from]),
    eo: m.ep.map((from, i) => (s.eo[from] + m.eo[i]) % 2),
  };
}

/** Aplica un movimiento: "R", "R'" o "R2". */
export function applyMove(state, move) {
  const match = /^([URFDLB])(['2]?)$/.exec(move);
  if (!match) throw new Error(`Movimiento no válido: "${move}"`);
  const turns = match[2] === "'" ? 3 : match[2] === '2' ? 2 : 1;
  let s = state;
  for (let i = 0; i < turns; i++) s = applyQuarter(s, match[1]);
  return s;
}

export function parseAlgorithm(alg) {
  return alg.trim() === '' ? [] : alg.trim().split(/\s+/);
}

export function applyAlgorithm(state, alg) {
  return parseAlgorithm(alg).reduce(applyMove, state);
}

export function invertMove(move) {
  if (move.endsWith("'")) return move.slice(0, -1);
  if (move.endsWith('2')) return move;
  return `${move}'`;
}

export function invertAlgorithm(alg) {
  return parseAlgorithm(alg).reverse().map(invertMove).join(' ');
}

export function isSolved(s) {
  return s.cp.every((v, i) => v === i) && s.co.every((v) => v === 0) &&
    s.ep.every((v, i) => v === i) && s.eo.every((v) => v === 0);
}

const pieceHome = (s, kind, i) =>
  kind === 'c' ? s.cp[i] === i && s.co[i] === 0 : s.ep[i] === i && s.eo[i] === 0;

// ---------- Cross y pares F2L (para cualquier cara de referencia) ----------

/** Aristas de la cruz de una cara. */
export const crossEdges = (face) => EDGES.map((n, i) => (n.includes(face) ? i : -1)).filter((i) => i >= 0);

/** Los 4 pares esquina+arista de una cara: [esquina, arista]. */
export function f2lPairs(face) {
  return CORNERS.map((name, c) => {
    if (!name.includes(face)) return null;
    const others = name.replace(face, '');
    const e = EDGES.findIndex((n) => n.length === 2 && n.includes(others[0]) && n.includes(others[1]));
    return [c, e];
  }).filter(Boolean);
}

export const crossSolved = (s, face = 'D') => crossEdges(face).every((e) => pieceHome(s, 'e', e));
export const pairSolved = (s, [c, e]) => pieceHome(s, 'c', c) && pieceHome(s, 'e', e);
/** Cruz resuelta y al menos un par correctamente insertado. */
export const crossAndFirstPairSolved = (s, face = 'D') =>
  crossSolved(s, face) && f2lPairs(face).some((p) => pairSolved(s, p));
export const f2lSolved = (s, face = 'D') =>
  crossSolved(s, face) && f2lPairs(face).every((p) => pairSolved(s, p));

// ---------- Última capa (cruz abajo, última capa arriba) ----------

/** Primeras dos capas resueltas y última capa orientada (OLL terminado). */
export const llOriented = (s) =>
  f2lSolved(s, 'D') && [0, 1, 2, 3].every((i) => s.co[i] === 0 && s.eo[i] === 0);

/** Cubo resuelto, salvo quizá un giro de la capa superior (AUF). */
export function solvedUpToAuf(s) {
  let t = s;
  for (let k = 0; k < 4; k++) {
    if (isSolved(t)) return true;
    t = applyMove(t, 'U');
  }
  return false;
}

/** Patrón de orientación de las 4 aristas de la última capa. */
export function llEdgePattern(s) {
  const bad = [0, 1, 2, 3].filter((i) => s.eo[i] === 1);
  if (bad.length === 0) return 'cruz';
  if (bad.length === 4) return 'punto';
  if (bad.length === 2) return (bad[1] - bad[0]) % 2 === 0 ? 'linea' : 'L';
  return 'invalido';
}
