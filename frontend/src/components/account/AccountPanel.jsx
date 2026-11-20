import { useCallback, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import Field from './Field.jsx';
import GoogleButton, { googleConfigured } from './GoogleButton.jsx';
import SyncStatus from './SyncStatus.jsx';

const PROVIDERS = { password: 'Contraseña', google: 'Google' };

function Profile() {
  const { service, user } = useAuth();
  const [name, setName] = useState(user.displayName);
  const [msg, setMsg] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try {
      await service.updateProfile(name.trim());
      setMsg({ ok: true, text: 'Guardado.' });
    } catch (err) {
      setMsg({ ok: false, text: err.fields?.display_name?.[0] ?? err.message });
    }
  };
  return (
    <section className="acct-section" aria-labelledby="acct-profile">
      <h3 id="acct-profile">Perfil</h3>
      <dl className="acct-stats">
        <div><dt>Usuario</dt><dd>{user.username}</dd></div>
        <div><dt>Correo</dt><dd>{user.email || '—'}</dd></div>
        <div><dt>Acceso con</dt><dd>{user.providers.map((p) => PROVIDERS[p] ?? p).join(' y ') || '—'}</dd></div>
      </dl>
      <form className="acct-form" onSubmit={save}>
        <Field label="Nombre visible" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        {msg && <p className={msg.ok ? 'acct-ok' : 'acct-error'} role="status">{msg.text}</p>}
        <div className="acct-actions"><button type="submit" className="btn btn--quiet">Guardar nombre</button></div>
      </form>
    </section>
  );
}

function Security() {
  const { service, user } = useAuth();
  const hasPassword = user.providers.includes('password');
  const hasGoogle = user.providers.includes('google');
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState(null);
  const [googleMsg, setGoogleMsg] = useState(null);

  const change = async (e) => {
    e.preventDefault();
    try {
      await service.changePassword(oldPassword, newPassword);
      setOld('');
      setNew('');
      setMsg({ ok: true, text: 'Contraseña actualizada. Se cerraron tus otras sesiones.' });
    } catch (err) {
      setMsg({ ok: false, text: err.fields?.new_password?.[0] ?? err.message });
    }
  };
  const onCredential = useCallback(async (credential) => {
    try {
      await service.linkGoogle(credential);
      setGoogleMsg({ ok: true, text: 'Google vinculado.' });
    } catch (err) {
      setGoogleMsg({ ok: false, text: err.message });
    }
  }, [service]);

  return (
    <section className="acct-section" aria-labelledby="acct-security">
      <h3 id="acct-security">Seguridad</h3>
      <form className="acct-form" onSubmit={change}>
        {hasPassword && <Field label="Contraseña actual" type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" required />}
        <Field label={hasPassword ? 'Contraseña nueva' : 'Define una contraseña'} type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" required />
        {msg && <p className={msg.ok ? 'acct-ok' : 'acct-error'} role="status">{msg.text}</p>}
        <div className="acct-actions"><button type="submit" className="btn btn--quiet">Cambiar contraseña</button></div>
      </form>
      {googleConfigured && (
        <div className="acct-google-box">
          {hasGoogle ? (
            <button type="button" className="btn btn--quiet" onClick={async () => { try { await service.unlinkGoogle(); setGoogleMsg({ ok: true, text: 'Google desvinculado.' }); } catch (err) { setGoogleMsg({ ok: false, text: err.message }); } }}>Desvincular Google</button>
          ) : (
            <GoogleButton onCredential={onCredential} text="continue_with" />
          )}
          {googleMsg && <p className={googleMsg.ok ? 'acct-ok' : 'acct-error'} role="status">{googleMsg.text}</p>}
        </div>
      )}
    </section>
  );
}

function Logout({ onLoggedOut }) {
  const { service, busy, overview, migrations } = useAuth();
  const pending = (overview?.pending ?? 0) + (overview?.error ?? 0);
  const unfinished = migrations.some((m) => m.status !== 'done');
  const closing = busy === 'logout';
  const go = async (wait) => onLoggedOut(await service.logout({ wait }));
  return (
    <section className="acct-section" aria-labelledby="acct-logout">
      <h3 id="acct-logout">Cerrar sesión</h3>
      {(pending > 0 || unfinished) && (
        <p className="acct-note acct-note--warn">
          Hay datos sin respaldar. Al cerrar sesión se intentará sincronizarlos; si no hay conexión, se conservarán en este dispositivo, aislados para esta cuenta, y se retomarán cuando vuelvas a iniciar sesión.
        </p>
      )}
      <div className="acct-actions">
        <button type="button" className="btn" disabled={closing} onClick={() => go(true)}>{closing ? 'Cerrando…' : 'Cerrar sesión'}</button>
        {closing && <button type="button" className="btn btn--quiet" onClick={() => go(false)}>Cerrar sin esperar</button>}
      </div>
    </section>
  );
}
export default function AccountPanel({ onLoggedOut }) {
  const { user } = useAuth();
  return (
    <div className="acct-card">
      <h2 className="acct-title">{user.displayName || user.username}</h2>
      <SyncStatus />
      <Profile />
      <Security />
      <Logout onLoggedOut={onLoggedOut} />
    </div>
  );
}