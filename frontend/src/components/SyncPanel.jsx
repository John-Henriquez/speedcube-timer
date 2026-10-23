import { useState } from 'react';

function describe({ status, at, result, message, connected }) {
  switch (status) {
    case 'syncing': return 'Sincronizando…';
    case 'ok': {
      const hora = at ? new Date(at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
      return `Sincronizado a las ${hora} · subidos ${result.pushed.solves + result.pushed.attempts}, bajados ${result.pulled.solves + result.pulled.attempts}`;
    }
    case 'offline': return 'Servidor no disponible. Se sincronizará al volver a casa.';
    case 'unauthorized': return 'La sesión caducó. Vuelve a conectar.';
    case 'error': return `Error: ${message}`;
    default: return connected ? 'Listo para sincronizar' : 'Sin conectar';
  }
}

export default function SyncPanel({ sync }) {
  const { state, syncNow, connect, disconnect } = sync;
  const [url, setUrl] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const showForm = !state.connected || state.status === 'unauthorized';

  const submit = async (e) => {
    e.preventDefault();
    setWorking(true);
    setError('');
    const res = await connect(url || state.serverUrl || 'http://localhost:8000', user, pass);
    setWorking(false);
    if (res.ok) setPass('');
    else setError(res.message);
  };

  return (
    <details className="sync">
      <summary>
        Sincronización <span className="sync__status" data-status={state.status}>{describe(state)}</span>
      </summary>
      {showForm ? (
        <form className="sync__form" onSubmit={submit}>
          <label>Servidor
            <input value={url} placeholder={state.serverUrl || 'http://localhost:8000'} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label>Usuario
            <input value={user} autoComplete="username" onChange={(e) => setUser(e.target.value)} />
          </label>
          <label>Contraseña
            <input type="password" value={pass} autoComplete="current-password" onChange={(e) => setPass(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={working || !user || !pass}>{working ? 'Conectando…' : 'Conectar'}</button>
          {error && <p className="sync__error">{error}</p>}
        </form>
      ) : (
        <div className="sync__actions">
          <button type="button" className="btn" onClick={syncNow} disabled={state.status === 'syncing'}>Sincronizar ahora</button>
          <button type="button" className="btn btn--quiet" onClick={disconnect}>Desconectar</button>
          <span className="sync__server">{state.serverUrl}</span>
        </div>
      )}
    </details>
  );
}
