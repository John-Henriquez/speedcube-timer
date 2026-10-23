/**
 * Traducción entre el formato local (camelCase) y el de la API (snake_case).
 * Los tiempos se truncan a ms enteros (la API usa enteros y los timers truncan, no redondean).
 */
const floorMs = (v) => (v == null ? null : Math.max(0, Math.floor(v)));
const iso = (v) => new Date(v).toISOString();

export const solveToServer = (s) => ({
  id: s.id,
  session: null, // aún no hay sesiones reales en el cliente
  puzzle: s.puzzle ?? '3x3',
  time_ms: floorMs(s.time),
  penalty: s.penalty ?? null,
  scramble: s.scramble ?? '',
  solved_at: s.date,
  deleted_at: s.deletedAt ?? null,
});

export const solveFromServer = (r) => ({
  id: r.id,
  puzzle: r.puzzle,
  session: 'default',
  time: r.time_ms,
  penalty: r.penalty ?? null,
  scramble: r.scramble ?? '',
  date: iso(r.solved_at),
  deletedAt: r.deleted_at ?? null,
});

export const attemptToServer = (a) => ({
  id: a.id,
  zone: a.zone,
  case_id: a.caseId ?? null,
  mode: a.mode,
  scramble: a.scramble ?? '',
  time_ms: floorMs(a.timeMs),
  recognition_ms: floorMs(a.recognitionMs),
  capture: a.capture,
  validation: a.validation,
  moves: a.moves ?? null,
  stage_marks: a.stageMarks ?? null,
  notes: a.notes ?? '',
  protocol_version: a.protocolVersion ?? 1,
  attempted_at: a.date,
  deleted_at: a.deletedAt ?? null,
});

export const attemptFromServer = (r) => ({
  id: r.id,
  zone: r.zone,
  caseId: r.case_id ?? null,
  mode: r.mode,
  scramble: r.scramble ?? '',
  timeMs: r.time_ms,
  recognitionMs: r.recognition_ms,
  capture: r.capture,
  validation: r.validation,
  moves: r.moves ?? null,
  stageMarks: r.stage_marks ?? null,
  notes: r.notes ?? '',
  protocolVersion: r.protocol_version,
  date: iso(r.attempted_at),
  deletedAt: r.deleted_at ?? null,
});
