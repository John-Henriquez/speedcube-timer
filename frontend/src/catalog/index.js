import { normalizeNotation, invertNotation, toFaceTurns } from '../core/cube/notation.js';
import { OLL_ROWS, PLL_ROWS, SOURCES } from './data.js';
import { ollCaseInfo, pllCaseInfo } from './analysis.js';

/**
 * Catálogo CFOP: ÚNICA fuente de casos y algoritmos de OLL y PLL. Todo lo que dice de cada caso
 * (categoría, algoritmos válidos, nivel de verificación) se calcula con el simulador a partir de los
 * datos de origen (data.js); nada de eso está escrito a mano.
 *
 * Niveles de verificación de un caso:
 *   contrastado  -> al menos dos fuentes independientes resuelven el mismo patrón y el simulador lo confirma
 *   una_fuente   -> el simulador lo confirma, pero solo una fuente válida respalda el patrón
 *   sin_verificar-> ningún algoritmo superó la verificación
 */
export const OLL_CATEGORIES = ['Dot', 'Mini L', 'Line', 'Cross'];
export const PLL_CATEGORIES = ['Solo aristas', 'Solo esquinas', 'Aristas y esquinas'];
export const LEVEL = { CONTRASTED: 'contrastado', ONE_SOURCE: 'una_fuente', UNVERIFIED: 'sin_verificar' };

// Nombres comunitarios de algunos OLL. Solo Sune y Antisune quedan verificados: su nombre se define
// por el propio algoritmo, que ambas fuentes publican idéntico. El resto son alias sin contrastar.
const OLL_ALIASES = {
  21: [{ name: 'H', verified: false }], 22: [{ name: 'Pi', verified: false }], 23: [{ name: 'U', verified: false }],
  24: [{ name: 'T', verified: false }], 25: [{ name: 'L', verified: false }],
  26: [{ name: 'Antisune', verified: true }], 27: [{ name: 'Sune', verified: true }],
};

const rawOll = () => OLL_ROWS.map(([number, shape, probability, org, battle]) => ({
  id: `oll-${number}`, set: 'OLL', number, name: `OLL ${number}`, shape, probability,
  aliases: OLL_ALIASES[number] ?? [],
  listed: [{ source: SOURCES.ORG, notation: org }, { source: SOURCES.BATTLE, notation: battle }],
}));

const rawPll = () => PLL_ROWS.map(([name, probability, org, quest]) => ({
  id: `pll-${name.toLowerCase()}`, set: 'PLL', name: `PLL ${name}`, short: name, shape: null, probability, aliases: [],
  listed: [...org.map((notation) => ({ source: SOURCES.ORG, notation })), ...quest.map((notation) => ({ source: SOURCES.QUEST, notation }))],
}));

/** Une la misma secuencia publicada por varias fuentes y calcula qué caso resuelve cada una. */
function withAnalysis(cases, infoOf) {
  for (const c of cases) {
    const byNotation = new Map();
    c.listed.forEach(({ source, notation }, order) => {
      const normalized = normalizeNotation(notation);
      if (!byNotation.has(normalized)) byNotation.set(normalized, { notation: normalized, original: notation, sources: new Set(), order, info: infoOf(normalized) });
      byNotation.get(normalized).sources.add(source);
    });
    c.algorithms = [...byNotation.values()];
  }
}

/**
 * Decide qué patrón corresponde a cada caso. Un patrón pertenece al caso donde más fuentes distintas
 * lo respaldan; si dos casos lo reclaman con el mismo respaldo, queda en disputa y no se asigna.
 */
function resolve(cases) {
  const support = new Map(); // patrón -> (id del caso -> fuentes)
  for (const c of cases) for (const a of c.algorithms) if (a.info.ok) {
    const byCase = support.get(a.info.key) ?? new Map();
    const sources = byCase.get(c.id) ?? new Set();
    a.sources.forEach((s) => sources.add(s));
    byCase.set(c.id, sources);
    support.set(a.info.key, byCase);
  }
  const owner = new Map();
  for (const [key, byCase] of support) {
    const ranked = [...byCase].sort((x, y) => y[1].size - x[1].size);
    owner.set(key, ranked.length === 1 || ranked[0][1].size > ranked[1][1].size ? ranked[0][0] : null);
  }

  const byKey = {};
  for (const c of cases) {
    const own = [...support].filter(([key, byCase]) => owner.get(key) === c.id && byCase.has(c.id));
    own.sort((x, y) => y[1].get(c.id).size - x[1].get(c.id).size);
    const [key, sourcesByCase] = own[0] ?? [null, null];
    c.key = key;
    c.evidence = key ? [...sourcesByCase.get(c.id)] : [];
    c.verification = {
      level: !key ? LEVEL.UNVERIFIED : c.evidence.length >= 2 ? LEVEL.CONTRASTED : LEVEL.ONE_SOURCE,
      sources: c.evidence,
      issues: [],
    };
    if (key) byKey[key] = c;
  }

  for (const c of cases) {
    for (const a of c.algorithms) {
      if (!a.info.ok) {
        a.status = 'invalido';
        a.reason = a.info.reason;
      } else if (a.info.key !== c.key) {
        const other = byKey[a.info.key];
        a.status = 'discrepante';
        a.reason = other ? `resuelve el patrón de ${other.name}, no el de ${c.name}` : 'su patrón no coincide con el del caso';
      } else {
        a.status = c.verification.level;
      }
      if (a.status === 'invalido' || a.status === 'discrepante') {
        c.verification.issues.push(`${[...a.sources].join(' / ')}: ${a.original} (${a.reason})`);
      }
    }
    // Recomendado: entre los verificados, el publicado por más fuentes; a igualdad, el primero listado.
    const usable = c.algorithms.filter((a) => a.status === LEVEL.CONTRASTED || a.status === LEVEL.ONE_SOURCE);
    usable.sort((x, y) => y.sources.size - x.sources.size || x.order - y.order);
    c.algorithms.forEach((a, i) => { a.id = `${c.id}#${i + 1}`; a.sources = [...a.sources]; });
    c.recommended = usable[0] ?? null;
    if (c.recommended) c.recommended.recommended = true;
    const best = c.recommended ? c.recommended.info : null;
    c.classSize = best?.classSize ?? null;
    delete c.listed;
  }
  return byKey;
}

function build() {
  const oll = rawOll();
  const pll = rawPll();
  withAnalysis(oll, ollCaseInfo);
  withAnalysis(pll, pllCaseInfo);
  const ollByKey = resolve(oll);
  const pllByKey = resolve(pll);
  for (const c of oll) c.category = c.recommended?.info.edges ?? null;
  for (const c of pll) c.category = c.recommended?.info.permutes ?? null;
  const all = [...oll, ...pll];
  return { oll, pll, all, byId: new Map(all.map((c) => [c.id, c])), byKey: { OLL: ollByKey, PLL: pllByKey } };
}

let cache = null;
export const getCatalog = () => (cache ??= build());
export const getCase = (id) => getCatalog().byId.get(id) ?? null;
export const casesOf = (set) => (set === 'OLL' ? getCatalog().oll : getCatalog().pll);

/**
 * Mezcla de solo giros de cara que deja el cubo en el caso (cubo resuelto + esta mezcla = el caso).
 * Es el inverso de la forma en giros de cara del algoritmo, no del algoritmo original: así la solución
 * (también en giros de cara) lo resuelve exactamente, incluso si el algoritmo lleva rotaciones a mitad
 * de camino. El caso es el mismo salvo un giro de la última capa, que se alinea con un AUF.
 */
export function scrambleFor(caseOrId, algorithm = null) {
  const c = typeof caseOrId === 'string' ? getCase(caseOrId) : caseOrId;
  const alg = algorithm ?? c?.recommended;
  if (!alg) throw new Error(`El caso ${c?.name ?? caseOrId} no tiene un algoritmo verificado`);
  return invertNotation(toFaceTurns(alg.notation));
}

export { SOURCES };