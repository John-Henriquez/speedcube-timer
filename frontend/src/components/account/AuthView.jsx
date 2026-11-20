import { useCallback, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import Field from './Field.jsx';
import GoogleButton, { googleConfigured } from './GoogleButton.jsx';

const USERNAME_RE = /^[\w.-]{3,30}$/;

/** Convierte un ApiError (o cualquier error) en { general, fields } para mostrarlo. */
function explain(error) {
  const fields = error.fields ?? {};
  const general = fields.non_field_errors?.[0] ?? (Object.keys(fields).length ? null : error.message);
  return { general, fields };
}

function useSubmit() {
  const [error, setError] = useState({ general: null, fields: {} });
  const [done, setDone] = useState(null);
  const run = useCallback(async (fn) => {
    setError({ general: null, fields: {} });
    setDone(null);
    try {
      setDone(await fn());
    } catch (e) {
      setError(explain(e));
    }
  }, []);
  return { error, setError, done, run };
}

function LoginForm({ onRecover }) {
  const { service, busy } = useAuth();
  const { error, run } = useSubmit();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form className="acct-form" onSubmit={(e) => { e.preventDefault(); run(() => service.login(identifier, password)); }}>
      <Field label="Usuario o correo" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
      <Field label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      {error.general && <p className="acct-error" role="alert">{error.general}</p>}
      <div className="acct-actions">
        <button type="submit" className="btn" disabled={busy === 'login'}>{busy === 'login' ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn btn--quiet" onClick={onRecover}>¿Olvidaste tu contraseña?</button>
      </div>
    </form>
  );
}

function RegisterForm() {
  const { service, busy } = useAuth();
  const { error, setError, run } = useSubmit();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', displayName: '' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    const fields = {};
    if (!USERNAME_RE.test(form.username)) fields.username = ['Entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.'];
    if (!/^\S+@\S+\.\S+$/.test(form.email)) fields.email = ['Escribe un correo válido.'];
    if (form.password.length < 8) fields.password = ['Usa al menos 8 caracteres.'];
    if (form.password !== form.confirm) fields.confirm = ['Las contraseñas no coinciden.'];
    if (Object.keys(fields).length) {
      setError({ general: null, fields });
      return;
    }
    run(() => service.register({ username: form.username, email: form.email, password: form.password, displayName: form.displayName.trim() }));
  };

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      <Field label="Usuario" value={form.username} onChange={set('username')} autoComplete="username" error={error.fields.username?.[0]} required />
      <Field label="Correo" type="email" value={form.email} onChange={set('email')} autoComplete="email" error={error.fields.email?.[0]} required />
      <Field label="Nombre visible (opcional)" value={form.displayName} onChange={set('displayName')} maxLength={60} error={error.fields.display_name?.[0]} />
      <Field label="Contraseña" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" hint="Mínimo 8 caracteres; evita contraseñas comunes." error={error.fields.password?.[0]} required />
      <Field label="Repite la contraseña" type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" error={error.fields.confirm?.[0]} required />
      {error.general && <p className="acct-error" role="alert">{error.general}</p>}
      <div className="acct-actions">
        <button type="submit" className="btn" disabled={busy === 'login'}>{busy === 'login' ? 'Creando…' : 'Crear cuenta'}</button>
      </div>
    </form>
  );
}

function RecoverForm({ onBack }) {
  const { service } = useAuth();
  const { error, done, run } = useSubmit();
  const [email, setEmail] = useState('');
  return (
    <form className="acct-form" onSubmit={(e) => { e.preventDefault(); run(async () => (await service.requestReset(email)).detail); }}>
      <p className="acct-hint">Te enviaremos un enlace para elegir una contraseña nueva.</p>
      <Field label="Correo de tu cuenta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      {error.general && <p className="acct-error" role="alert">{error.general}</p>}
      {done && <p className="acct-ok" role="status">{done}</p>}
      <div className="acct-actions">
        <button type="submit" className="btn">Enviar enlace</button>
        <button type="button" className="btn btn--quiet" onClick={onBack}>Volver</button>
      </div>
    </form>
  );
}

function ResetForm({ params, onDone }) {
  const { service } = useAuth();
  const { error, setError, done, run } = useSubmit();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError({ general: null, fields: { confirm: ['Las contraseñas no coinciden.'] } });
      return;
    }
    run(async () => (await service.confirmReset({ ...params, password })).detail);
  };
  return (
    <form className="acct-form" onSubmit={submit}>
      <p className="acct-hint">Elige tu contraseña nueva.</p>
      <Field label="Contraseña nueva" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={error.fields.password?.[0]} required />
      <Field label="Repítela" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={error.fields.confirm?.[0]} required />
      {error.general && <p className="acct-error" role="alert">{error.general}</p>}
      {done && <p className="acct-ok" role="status">{done}</p>}
      <div className="acct-actions">
        {done ? <button type="button" className="btn" onClick={onDone}>Ir a iniciar sesión</button> : <button type="submit" className="btn">Guardar contraseña</button>}
      </div>
    </form>
  );
}

function ServerSettings() {
  const { service, serverUrl } = useAuth();
  const [value, setValue] = useState(serverUrl);
  const [message, setMessage] = useState(null);
  const save = (e) => {
    e.preventDefault();
    try {
      service.setServerUrl(value);
      setMessage({ ok: true, text: 'Guardado.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  };
  return (
    <details className="acct-advanced">
      <summary>Servidor</summary>
      <form className="acct-form" onSubmit={save}>
        <Field label="Dirección del servidor" value={value} onChange={(e) => setValue(e.target.value)} hint="Por defecto, el mismo equipo que sirve esta página, en el puerto 8000." />
        {message && <p className={message.ok ? 'acct-ok' : 'acct-error'} role="status">{message.text}</p>}
        <div className="acct-actions"><button type="submit" className="btn btn--quiet">Guardar</button></div>
      </form>
    </details>
  );
}

/** Pantalla para quien no tiene sesión: entrar, crear cuenta o recuperar la contraseña. */
export default function AuthView({ resetParams, onResetDone }) {
  const { service, pendingAccounts } = useAuth();
  const [view, setView] = useState(resetParams ? 'reset' : 'login');
  const [googleError, setGoogleError] = useState(null);

  const onCredential = useCallback(async (credential) => {
    setGoogleError(null);
    try {
      await service.loginWithGoogle(credential);
    } catch (e) {
      setGoogleError(e.message);
    }
  }, [service]);

  return (
    <div className="acct-card">
      {pendingAccounts.length > 0 && (
        <div className="acct-note acct-note--warn" role="status">
          {pendingAccounts.map((a) => {
            const changes = a.pending + a.error;
            return (
              <p key={a.id}>
                La cuenta <strong>{a.username}</strong> tiene {changes > 0 ? `${changes} cambios` : 'datos'} sin respaldar guardados en este dispositivo.
                Inicia sesión con esa cuenta para terminar de sincronizarlos.
              </p>
            );
          })}
        </div>
      )}

      {view === 'reset' ? (
        <ResetForm params={resetParams} onDone={() => { onResetDone?.(); setView('login'); }} />
      ) : view === 'recover' ? (
        <RecoverForm onBack={() => setView('login')} />
      ) : (
        <>
          <div className="seg" role="group" aria-label="Acceso">
            <button type="button" className="seg__btn" aria-pressed={view === 'login'} onClick={() => setView('login')}>Entrar</button>
            <button type="button" className="seg__btn" aria-pressed={view === 'register'} onClick={() => setView('register')}>Crear cuenta</button>
          </div>
          {view === 'login' ? <LoginForm onRecover={() => setView('recover')} /> : <RegisterForm />}
          {googleConfigured && (
            <div className="acct-or">
              <span>o</span>
              <GoogleButton onCredential={onCredential} text={view === 'login' ? 'signin_with' : 'signup_with'} />
              {googleError && <p className="acct-error" role="alert">{googleError}</p>}
            </div>
          )}
        </>
      )}
      <ServerSettings />
    </div>
  );
}