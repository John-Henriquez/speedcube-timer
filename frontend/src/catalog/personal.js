import { normalizeNotation } from '../core/cube/notation.js';
import { sameState, stateAfter } from '../core/cube/sim.js';
import { getCatalog } from './index.js';
import { ollCaseInfo, pllCaseInfo } from './analysis.js';

/**
 * Comprueba un algoritmo propio antes de guardarlo como variante de un caso existente.
 * Se acepta solo si el simulador confirma que resuelve ESE caso; nunca cambia el nombre ni el patrón del caso.
 * Devuelve { ok, normalized, reason?, duplicateOf?, warnings }.
 */
export function checkPersonalAlgorithm(caseObj, notation, existing = []) {
  let normalized;
  try {
    normalized = normalizeNotation(notation);
  } catch (error) {
    return { ok: false, reason: error.message, warnings: [] };
  }
  if (normalized === '') return { ok: false, reason: 'Escribe la secuencia del algoritmo.', warnings: [] };

  const known = [...caseObj.algorithms.map((a) => ({ ...a, origin: 'catálogo' })), ...existing.map((a) => ({ ...a, origin: 'personal' }))];
  const same = known.find((a) => a.notation === normalized);
  if (same) return { ok: false, normalized, reason: `Ya existe (${same.origin}).`, duplicateOf: same.id, warnings: [] };

  const info = (caseObj.set === 'OLL' ? ollCaseInfo : pllCaseInfo)(normalized);
  if (!info.ok) return { ok: false, normalized, reason: `No es un algoritmo de ${caseObj.set}: ${info.reason}.`, warnings: [] };
  if (info.key !== caseObj.key) {
    const other = getCatalog().byKey[caseObj.set][info.key];
    return { ok: false, normalized, reason: `Resuelve ${other ? other.name : 'otro caso'}, no ${caseObj.name}.`, warnings: [] };
  }
  // Mismo efecto exacto que otra variante: se avisa, pero no se descarta.
  const mine = stateAfter(normalized);
  const twin = known.find((a) => {
    try { return sameState(mine, stateAfter(a.notation)); } catch { return false; }
  });
  return {
    ok: true,
    normalized,
    warnings: twin ? [`Produce exactamente el mismo efecto que una variante existente (${twin.notation}).`] : [],
  };
}