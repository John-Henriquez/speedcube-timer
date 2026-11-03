/**
 * Notación de movimientos del cubo 3x3 (subconjunto estándar de la WCA y de la comunidad):
 *   caras U D L R F B · anchos u d l r f b (o Uw, Rw...) · capas M E S · rotaciones x y z
 * con sufijos ' (inverso) y 2 (doble). "R2'" se acepta y significa R2.
 */
const TOKEN = /^([URFDLB])w$|^([URFDLBurfdlbMESxyz])$/;
const TURNS = { '': 1, "'": 3, '2': 2, "2'": 2 };

/** Descompone una secuencia en movimientos { move, turns } (turns: 1, 2 o 3 cuartos de vuelta horarios). */
export function tokenize(alg) {
  const text = String(alg ?? '').trim();
  if (text === '') return [];
  return text.split(/\s+/).map((raw) => {
    const m = /^(.*?)(2'|2|')?$/.exec(raw);
    const body = m[1];
    const suffix = m[2] ?? '';
    const base = TOKEN.exec(body);
    if (!base || !(suffix in TURNS)) throw new Error(`Movimiento no válido: "${raw}"`);
    const move = base[1] ? base[1].toLowerCase() : base[2];
    return { move, turns: TURNS[suffix] };
  });
}

export const isValidNotation = (alg) => {
  try {
    return tokenize(alg).length > 0;
  } catch {
    return false;
  }
};

const SUFFIX = { 1: '', 2: '2', 3: "'" };
export const formatTokens = (tokens) => tokens.map((t) => t.move + SUFFIX[t.turns]).join(' ');

/** Misma secuencia en forma canónica: "R2'" -> "R2", "Rw" -> "r", espacios normalizados. */
export const normalizeNotation = (alg) => formatTokens(tokenize(alg));

const inverseTurns = (t) => (4 - t) % 4;

/** Secuencia inversa: movimientos en orden contrario y cada uno invertido. */
export const invertNotation = (alg) =>
  formatTokens(tokenize(alg).reverse().map((t) => ({ move: t.move, turns: inverseTurns(t.turns) })));

// ---------- Conversión a giros de cara (sin anchos, capas ni rotaciones) ----------
// Se recorre la secuencia llevando un "marco": qué centro está físicamente en cada posición.
// Las rotaciones y las capas solo cambian el marco; los giros se emiten con el nombre del centro.
const AXIS_OF = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
const NEW_FROM = {
  // nuevo[posición] = viejo[posición de origen], para un cuarto de vuelta horario de la rotación
  x: { U: 'F', B: 'U', D: 'B', F: 'D' },
  y: { L: 'F', B: 'L', R: 'B', F: 'R' },
  z: { R: 'U', D: 'R', L: 'D', U: 'L' },
};

function rotateFrame(frame, axis, turns) {
  let f = frame;
  for (let i = 0; i < turns; i++) {
    const next = { ...f };
    for (const [to, from] of Object.entries(NEW_FROM[axis])) next[to] = f[from];
    f = next;
  }
  return f;
}

/** Une giros consecutivos de la misma cara (también a través de la cara opuesta, que conmuta). */
function simplify(list) {
  const out = [];
  for (const cur of list) {
    let merged = false;
    for (let i = out.length - 1; i >= 0 && AXIS_OF[out[i].move] === AXIS_OF[cur.move]; i--) {
      if (out[i].move === cur.move) {
        const turns = (out[i].turns + cur.turns) % 4;
        if (turns === 0) out.splice(i, 1);
        else out[i] = { move: cur.move, turns };
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...cur });
  }
  return out;
}

/**
 * Equivale la secuencia a otra con solo giros de cara (U D L R F B). El resultado deja las piezas
 * en el mismo sitio respecto a los centros; solo se pierde la orientación final con la que se
 * sostiene el cubo, que no importa para reproducir un caso.
 */
export function toFaceTurns(alg) {
  let frame = { U: 'U', D: 'D', L: 'L', R: 'R', F: 'F', B: 'B' };
  const out = [];
  const emit = (position, turns) => {
    if (turns % 4) out.push({ move: frame[position], turns: turns % 4 });
  };
  const rot = (axis, turns) => {
    frame = rotateFrame(frame, axis, turns % 4);
  };
  for (const { move, turns: t } of tokenize(alg)) {
    const inv = inverseTurns(t);
    switch (move) {
      case 'U': case 'D': case 'L': case 'R': case 'F': case 'B': emit(move, t); break;
      case 'r': emit('L', t); rot('x', t); break;
      case 'l': emit('R', t); rot('x', inv); break;
      case 'u': emit('D', t); rot('y', t); break;
      case 'd': emit('U', t); rot('y', inv); break;
      case 'f': emit('B', t); rot('z', t); break;
      case 'b': emit('F', t); rot('z', inv); break;
      case 'M': emit('R', t); emit('L', inv); rot('x', inv); break;
      case 'E': emit('U', t); emit('D', inv); rot('y', inv); break;
      case 'S': emit('F', inv); emit('B', t); rot('z', t); break;
      case 'x': rot('x', t); break;
      case 'y': rot('y', t); break;
      case 'z': rot('z', t); break;
      default: throw new Error(`Movimiento no soportado: ${move}`);
    }
  }
  return formatTokens(simplify(out));
}