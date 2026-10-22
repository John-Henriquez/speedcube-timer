import { applyMove, crossEdges, invertMove, solvedState } from './cube.js';

/**
 * Resuelve solo la cruz mediante una búsqueda en anchura sobre las 4 aristas
 * (190.080 estados, máximo 8 movimientos). Se usa para generar estados con la
 * cruz resuelta y el resto del cubo aleatorio. La tabla se construye una vez.
 */
const MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}'`, `${f}2`]);
const tables = MOVES.map((name) => {
  const t = applyMove(solvedState(), name);
  const inv = [];
  t.ep.forEach((from, i) => { inv[from] = i; }); // pieza en `from` pasa a la posición i
  return { name, inv, eo: t.eo };
});

const encode = (pos, ori) =>
  (((pos[0] * 12 + pos[1]) * 12 + pos[2]) * 12 + pos[3]) * 16 + ori[0] + 2 * ori[1] + 4 * ori[2] + 8 * ori[3];

function decode(key) {
  const ori = [key & 1, (key >> 1) & 1, (key >> 2) & 1, (key >> 3) & 1];
  let rest = Math.floor(key / 16);
  const pos = [];
  for (let i = 3; i >= 0; i--) { pos[i] = rest % 12; rest = Math.floor(rest / 12); }
  return { pos, ori };
}

const cache = new Map();

function buildTable(face) {
  const tracked = crossEdges(face);
  const startKey = encode(tracked, [0, 0, 0, 0]);
  const parent = new Map([[startKey, null]]);
  let frontier = [startKey];
  while (frontier.length) {
    const next = [];
    for (const key of frontier) {
      const { pos, ori } = decode(key);
      for (let m = 0; m < tables.length; m++) {
        const { inv, eo } = tables[m];
        const newPos = pos.map((p) => inv[p]);
        const newOri = ori.map((o, t) => (o + eo[newPos[t]]) % 2);
        const k2 = encode(newPos, newOri);
        if (!parent.has(k2)) {
          parent.set(k2, { from: key, move: tables[m].name });
          next.push(k2);
        }
      }
    }
    frontier = next;
  }
  return { tracked, startKey, parent };
}

/** Movimientos que resuelven la cruz de `face` en el estado dado (lista vacía si ya está resuelta). */
export function solveCross(state, face = 'D') {
  if (!cache.has(face)) cache.set(face, buildTable(face));
  const { tracked, startKey, parent } = cache.get(face);
  const pos = tracked.map((piece) => state.ep.indexOf(piece));
  const ori = pos.map((p) => state.eo[p]);
  let key = encode(pos, ori);
  const solution = [];
  while (key !== startKey) {
    const step = parent.get(key);
    solution.push(invertMove(step.move));
    key = step.from;
  }
  return solution;
}

