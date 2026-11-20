import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
const SCRIPT = 'https://accounts.google.com/gsi/client';
let loading = null;

function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    if (globalThis.google?.accounts?.id) return resolve();
    const el = document.createElement('script');
    el.src = SCRIPT;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null; // permite reintentar si no había conexión
      reject(new Error('No se pudo cargar Google'));
    };
    document.head.appendChild(el);
    return undefined;
  });
  return loading;
}

/**
 * Botón oficial de Google Identity Services. Entrega una credencial (ID token) que el backend verifica; la app
 * nunca ve la contraseña de Google. Si no hay GOOGLE_CLIENT_ID configurado, no se muestra nada.
 */
export default function GoogleButton({ onCredential, text = 'signin_with' }) {
  const box = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current) return;
        globalThis.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => onCredential(r.credential) });
        globalThis.google.accounts.id.renderButton(box.current, { theme: 'filled_black', size: 'large', text, shape: 'rectangular' });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [onCredential, text]);

  if (!CLIENT_ID) return null;
  return (
    <div className="acct-google">
      <div ref={box} />
      {failed && <p className="acct-hint">No se pudo cargar el acceso con Google (¿sin conexión?). Puedes usar tu correo y contraseña.</p>}
    </div>
  );
}

export const googleConfigured = Boolean(CLIENT_ID);