import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import AccountPanel from '../components/account/AccountPanel.jsx';
import AuthView from '../components/account/AuthView.jsx';

/** Resultado de un cierre de sesión: dice la verdad sobre si los datos quedaron respaldados o no. */
function LogoutNotice({ result, onClose }) {
  const kept = !result.backedUp;
  const pieces = [];
  if (result.pending) pieces.push(`${result.pending} cambios pendientes`);
  if (result.errors) pieces.push(`${result.errors} registros con error`);
  if (result.migrationsPending) pieces.push('datos de invitado por confirmar');
  return (
    <div className={`acct-note ${kept ? 'acct-note--warn' : ''}`} role="status">
      {kept
        ? <p><strong>Sesión cerrada, pero hay datos sin respaldar</strong> ({pieces.join(', ')}). Se conservan en este dispositivo, aislados para esa cuenta: nadie más los verá. Se sincronizarán cuando vuelvas a iniciar sesión con ella.</p>
        : <p><strong>Sesión cerrada.</strong> Todo quedó respaldado en el servidor y este dispositivo quedó limpio.</p>}
      <button type="button" className="btn btn--quiet" onClick={onClose}>Entendido</button>
    </div>
  );
}

export default function AccountPage({ resetParams, onResetDone }) {
  const { ready, status } = useAuth();
  const [notice, setNotice] = useState(null);

  return (
    <main className="page acct-page">
      {!ready && <p className="acct-hint">Cargando…</p>}
      {ready && status === 'guest' && (
        <>
          {notice && <LogoutNotice result={notice} onClose={() => setNotice(null)} />}
          <div className="acct-note">
            <p>
              Estás usando la app como <strong>invitado</strong>: todo funciona y tus datos se guardan solo en este dispositivo.
              Al crear una cuenta o iniciar sesión, lo que ya tienes se respalda en el servidor y se sincroniza solo.
            </p>
          </div>
          <AuthView resetParams={resetParams} onResetDone={onResetDone} />
        </>
      )}
      {ready && status === 'account' && <AccountPanel onLoggedOut={setNotice} />}
    </main>
  );
}