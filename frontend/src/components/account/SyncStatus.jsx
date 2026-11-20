import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { describeSync, shortTime } from '../../auth/syncText.js';

/** Segundos que faltan para `timestamp` (ms), actualizado cada segundo. */
function useCountdown(timestamp) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timestamp) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timestamp]);
  return timestamp ? Math.max(0, Math.ceil((timestamp - now) / 1000)) : null;
}

export default function SyncStatus() {
  const auth = useAuth();
  const { service, overview, migrations } = auth;
  const info = describeSync(auth);
  const wait = useCountdown(overview?.nextAttemptAt);
  const [syncing, setSyncing] = useState(false);

  const run = async (fn) => {
    setSyncing(true);
    try {
      await fn();
    } finally {
      setSyncing(false);
    }
  };
  const open = migrations.filter((m) => m.status !== 'done');

  return (
    <section className="acct-section" aria-labelledby="acct-sync">
      <h3 id="acct-sync">Sincronización</h3>
      <p className={`acct-status acct-status--${info.tone}`} role="status">
        <span className="acct-dot" aria-hidden="true" /> {info.label}
      </p>
      <p className="acct-hint">{info.detail}</p>

      <dl className="acct-stats">
        <div><dt>Pendientes</dt><dd>{overview?.pending ?? 0}</dd></div>
        <div><dt>Con error</dt><dd>{overview?.error ?? 0}</dd></div>
        <div><dt>Última sincronización</dt><dd>{shortTime(overview?.lastSyncAt) ?? '—'}</dd></div>
        {wait != null && <div><dt>Próximo reintento</dt><dd>en {wait} s</dd></div>}
      </dl>
      {overview?.lastError && (overview.pending > 0 || overview.error > 0) && <p className="acct-hint">Último aviso: {overview.lastError}</p>}

      {open.map((m) => (
        <p key={m.id} className={`acct-note ${m.status === 'error' ? 'acct-note--bad' : ''}`}>
          Datos de invitado: {m.total?.total ?? '?'} registros. {m.status === 'error'
            ? `El servidor rechazó ${m.rejected}; se conservan en este dispositivo hasta que se resuelva.`
            : m.remaining > 0 ? `Faltan ${m.remaining} por confirmar; la copia local se conserva hasta entonces.` : 'Terminando…'}
        </p>
      ))}

      <div className="acct-actions">
        <button type="button" className="btn btn--quiet" disabled={syncing} onClick={() => run(() => service.syncNow())}>
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        {(overview?.error ?? 0) > 0 && (
          <button type="button" className="btn btn--quiet" disabled={syncing} onClick={() => run(() => service.retryErrors())}>Reintentar los que fallaron</button>
        )}
      </div>
    </section>
  );
}