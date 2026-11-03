const USABLE = ['contrastado', 'una_fuente'];

/**
 * Algoritmos disponibles para practicar un caso: los verificados del catálogo y las variantes personales
 * (que solo se guardan si el simulador confirmó que resuelven ese caso). Los descartados no aparecen.
 */
export function usableAlgorithms(caseObj, userAlgs = {}) {
  const catalog = caseObj.algorithms
    .filter((a) => USABLE.includes(a.status))
    .map((a) => ({ id: a.id, notation: a.notation, origin: 'catálogo', recommended: Boolean(a.recommended), status: a.status, sources: a.sources }));
  const mine = (userAlgs[caseObj.id] ?? []).map((a) => ({ id: a.id, notation: a.notation, origin: 'personal', recommended: false, status: 'validado', sources: [] }));
  return [...catalog, ...mine];
}

/**
 * Algoritmo a usar: el elegido explícitamente; si no, el preferido del usuario; si no, el recomendado.
 * Una variante personal nunca sustituye al recomendado a menos que el usuario la marque como preferida.
 */
export function chooseAlgorithm(caseObj, { chosenId = '', userAlgs = {}, preferred = {} } = {}) {
  const list = usableAlgorithms(caseObj, userAlgs);
  return (
    list.find((a) => a.id === chosenId) ??
    list.find((a) => a.id === preferred[caseObj.id]) ??
    list.find((a) => a.recommended) ??
    list[0] ??
    null
  );
}