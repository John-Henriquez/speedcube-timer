/**
 * Servidor simulado para las pruebas: mismo contrato que el backend real (cuentas, sesiones por token y
 * sincronización con aceptados / obsoletos / rechazados), con controles para provocar fallos.
 */
export function createFakeServer() {
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 10, 1, 0, 0, ++tick)).toISOString();
  const users = [];
  const sessions = new Map(); // token -> username
  const rows = { solves: new Map(), attempts: new Map() }; // id -> { owner, row }
  const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });

  const server = {
    online: true,
    failNext: 0, // próximas peticiones que fallan como un corte de red
    forceStatus: null, // si se define, la sincronización responde ese estado HTTP
    syncOnline: true, // en false solo se corta la sincronización (las cuentas siguen funcionando)
    log: [],
    syncPosts: [],

    /** Invalida todas las sesiones (como si hubieran caducado en el servidor). */
    revokeAll: () => sessions.clear(),
    ownRows: (username, kind) => [...rows[kind].values()].filter((r) => r.owner === username).map((r) => r.row),
    ownedBy: (kind, id) => rows[kind].get(id)?.owner ?? null,
    /** Datos que "ya estaban" en el servidor (por ejemplo, subidos desde otro dispositivo). */
    seed(username, kind, row) {
      rows[kind].set(row.id, { owner: username, row: { client_updated_at: null, deleted_at: null, ...row, updated_at: stamp() } });
    },
  };

  const userOf = (opts) => {
    const token = /^Token (.+)$/.exec(opts.headers?.Authorization ?? '')?.[1];
    const username = token && sessions.get(token);
    return username ? users.find((u) => u.username === username) : null;
  };
  const payload = (u) => ({ id: u.id, username: u.username, email: u.email, display_name: u.username, providers: ['password'] });
  const startSession = (u) => {
    const token = `tok-${u.username}-${sessions.size + 1}`;
    sessions.set(token, u.username);
    return token;
  };

  server.fetch = async (url, opts = {}) => {
    if (!server.online) throw new TypeError('sin red');
    if (server.failNext > 0) {
      server.failNext -= 1;
      throw new TypeError('corte de red');
    }
    const { pathname, searchParams } = new URL(url);
    const method = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const user = userOf(opts);
    server.log.push({ method, path: pathname, user: user?.username ?? null });

    if (pathname === '/api/health/') return json({ status: 'ok' });
    if (pathname === '/api/auth/register/') {
      if (users.some((u) => u.username.toLowerCase() === body.username.toLowerCase())) return json({ username: ['Ese nombre de usuario ya está en uso.'] }, 400);
      if (users.some((u) => u.email === body.email.toLowerCase())) return json({ email: ['Ya existe una cuenta con este correo.'] }, 400);
      const u = { id: users.length + 1, username: body.username, email: body.email.toLowerCase(), password: body.password };
      users.push(u);
      return json({ token: startSession(u), user: payload(u) }, 201);
    }
    if (pathname === '/api/auth/login/') {
      const u = users.find((x) => x.username.toLowerCase() === body.identifier.toLowerCase() || x.email === body.identifier.toLowerCase());
      if (!u || u.password !== body.password) return json({ detail: 'Credenciales incorrectas.', code: 'invalid_credentials' }, 400);
      return json({ token: startSession(u), user: payload(u) });
    }
    if (!user) return json({ detail: 'Sesión no válida.' }, 401);
    if (pathname === '/api/auth/logout/') {
      sessions.delete(/^Token (.+)$/.exec(opts.headers.Authorization)[1]);
      return json(null, 204);
    }
    if (pathname === '/api/auth/me/') return json(payload(user));

    if (pathname === '/api/sync/') {
      if (!server.syncOnline) throw new TypeError('sin red');
      if (server.forceStatus) return json({ detail: 'error forzado' }, server.forceStatus);
      if (method === 'GET') {
        const since = searchParams.get('since');
        const pick = (kind) => server.ownRows(user.username, kind).filter((r) => !since || r.updated_at > since);
        return json({ server_time: stamp(), solves: pick('solves'), attempts: pick('attempts') });
      }
      server.syncPosts.push({ user: user.username, solves: body.solves.length, attempts: body.attempts.length });
      const out = { accepted: { solves: [], attempts: [] }, stale: { solves: [], attempts: [] }, rejected: { solves: {}, attempts: {} } };
      for (const kind of ['solves', 'attempts']) {
        for (const item of body[kind] ?? []) {
          const valid = Number.isFinite(item.time_ms ?? 0) && (item.time_ms ?? 0) >= 0 && [null, undefined, '+2', 'DNF'].includes(item.penalty);
          const current = rows[kind].get(item.id);
          if (!valid) out.rejected[kind][item.id] = { penalty: ['Valor no válido.'] };
          else if (current && current.owner !== user.username) out.rejected[kind][item.id] = { id: ['Este identificador pertenece a otra cuenta.'] };
          else if (current?.row.client_updated_at && item.client_updated_at && item.client_updated_at < current.row.client_updated_at) out.stale[kind].push(item.id);
          else {
            rows[kind].set(item.id, { owner: user.username, row: { ...item, updated_at: stamp() } });
            out.accepted[kind].push(item.id);
          }
        }
      }
      return json({ server_time: stamp(), solves: out.accepted.solves.length, attempts: out.accepted.attempts.length, ...out });
    }
    return json({ detail: 'no encontrado' }, 404);
  };
  return server;
}

const iso = (i) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
export const makeSolve = (i, extra = {}) => ({
  id: `solve-${i}`, time: 9000 + i, penalty: null, scramble: 'R U', date: iso(i), puzzle: '3x3', session: 'default', ...extra,
});
export const makeAttempt = (i, extra = {}) => ({
  id: `attempt-${i}`, zone: 'oll', caseId: 'oll-27', mode: 'ejecucion', scramble: 'R', algorithm: null, timeMs: 1500 + i,
  recognitionMs: null, capture: 'manual', validation: 'valida', moves: null, stageMarks: null, notes: '', protocolVersion: 1, date: iso(100 + i), ...extra,
});