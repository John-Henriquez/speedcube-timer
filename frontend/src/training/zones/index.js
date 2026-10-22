import {
  applyAlgorithm, crossAndFirstPairSolved, crossSolved, f2lSolved, llOriented, solvedState, solvedUpToAuf,
} from '../../core/cube/cube.js';
import { generateCross, generateCrossPair, generateF2L, generateOll, generatePll } from '../generators.js';

/**
 * Definición de las zonas de prueba. Para añadir una: agregar un objeto con la
 * misma forma. `check` decide si un estado final cumple el objetivo de la zona.
 */
export const ZONES = [
  {
    id: 'cross',
    name: 'Cross',
    objective: 'Evaluar la planificación, ejecución y consistencia al resolver la cruz.',
    instructions: ['Elige el color de la cruz.', 'Inspecciona la mezcla sin límite de tiempo.', 'Inicia el timer al comenzar a ejecutar y detenlo al terminar la cruz.'],
    initialState: 'Cubo mezclado (20 movimientos aleatorios), orientación estándar.',
    protocol: 'El tiempo mide solo la ejecución; la inspección queda fuera.',
    evaluates: ['Ejecución de la cruz planificada', 'Consistencia entre intentos'],
    generate: generateCross,
    check: (s, { face = 'D' } = {}) => crossSolved(s, face),
    failure: 'La cruz no quedó resuelta.',
  },
  {
    id: 'cross-pair',
    name: 'Cross + primer par',
    objective: 'Evaluar la transición de la cruz al primer par F2L.',
    instructions: ['Elige el color de la cruz.', 'Inspecciona la mezcla.', 'Resuelve la cruz y un par esquina-arista insertado en su ranura; detén el timer.'],
    initialState: 'Cubo mezclado, orientación estándar. Vale cualquier ranura.',
    protocol: 'Se mide el tiempo total. Sin marcas de tiempo por etapa no se separa la cruz del par.',
    evaluates: ['Reconocimiento del primer par', 'Continuidad después de la cruz'],
    generate: generateCrossPair,
    check: (s, { face = 'D' } = {}) => crossAndFirstPairSolved(s, face),
    failure: 'Falta la cruz o ningún par quedó insertado.',
  },
  {
    id: 'f2l',
    name: 'F2L con cruz resuelta',
    objective: 'Aislar el reconocimiento, emparejamiento e inserción de los cuatro pares.',
    instructions: ['Aplica la mezcla: deja la cruz resuelta (abajo) y el resto mezclado.', 'Inspecciona y empieza cuando quieras.', 'Detén el timer al completar los cuatro pares.'],
    initialState: 'Cruz resuelta; esquinas y aristas restantes en un estado aleatorio alcanzable.',
    protocol: 'Se mide desde el primer movimiento de F2L hasta tener los cuatro pares.',
    evaluates: ['Reconocimiento de pares', 'Pausas y movimientos innecesarios', 'Consistencia'],
    generate: generateF2L,
    check: (s) => f2lSolved(s, 'D'),
    failure: 'Las dos primeras capas no quedaron resueltas.',
  },
  {
    id: 'oll',
    name: 'OLL aislado',
    objective: 'Evaluar el conocimiento, reconocimiento y ejecución de casos OLL.',
    instructions: ['Aplica la mezcla del caso.', 'Reconoce el caso y ejecuta el algoritmo.', 'Detén el timer con la última capa orientada.'],
    initialState: 'Dos primeras capas resueltas; última capa que requiere orientar piezas, con un AUF aleatorio.',
    protocol: 'Modalidad "ejecución" (conoces el caso) o "conocimiento" (¿lo sabes resolver?). Una ejecución lenta no cuenta como falta de velocidad si el caso no se conoce.',
    evaluates: ['Casos desconocidos', 'Reconocimiento vs. ejecución', 'Errores recurrentes'],
    generate: generateOll,
    check: (s) => llOriented(s),
    failure: 'La última capa no quedó orientada.',
  },
  {
    id: 'pll',
    name: 'PLL aislado',
    objective: 'Evaluar el conocimiento, reconocimiento y ejecución de casos PLL.',
    instructions: ['Aplica la mezcla del caso.', 'Reconoce el caso y ejecuta el algoritmo.', 'Detén el timer con el cubo resuelto (admite un último AUF).'],
    initialState: 'Dos primeras capas resueltas y última capa orientada, con una permutación por resolver y un AUF aleatorio.',
    protocol: 'Igual que OLL: modalidades "ejecución" y "conocimiento".',
    evaluates: ['Casos desconocidos', 'Reconocimiento de permutaciones', 'Ejecución y errores'],
    generate: generatePll,
    check: (s) => solvedUpToAuf(s),
    failure: 'El cubo no quedó resuelto.',
  },
];

export const getZone = (id) => {
  const zone = ZONES.find((z) => z.id === id);
  if (!zone) throw new Error(`Zona desconocida: ${id}`);
  return zone;
};

/**
 * Valida una solución escrita (modo "asistido"): aplica mezcla + solución al
 * modelo del cubo y comprueba el objetivo de la zona. Con tiempo manual y sin
 * movimientos registrados no hay forma de validar: el intento queda "sin verificar".
 */
export function validateSolution(zoneId, scramble, solution, options = {}) {
  const zone = getZone(zoneId);
  let state;
  try {
    state = applyAlgorithm(applyAlgorithm(solvedState(), scramble), solution);
  } catch {
    return { valid: false, reason: 'La solución contiene un movimiento no reconocido.' };
  }
  const valid = zone.check(state, options);
  return { valid, reason: valid ? null : zone.failure };
}
