import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createAuthService } from './service.js';

const AuthContext = createContext(null);

/**
 * Crea el servicio de cuentas una sola vez, lo arranca y publica su estado a la interfaz. `shouldSkip` evita
 * sincronizar mientras algún cronómetro corre (no se debe gastar tiempo de CPU/red en plena resolución).
 */
export function AuthProvider({ shouldSkip, children }) {
  const ref = useRef(null);
  ref.current ??= createAuthService({ shouldSkip });
  const service = ref.current;
  const [state, setState] = useState(() => service.getState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const off = service.subscribe((next) => alive && setState(next));
    service.init().then((next) => {
      if (!alive) return;
      setState(next);
      setReady(true);
    });
    return () => {
      alive = false;
      off(); // el servicio vive tanto como la página: no se detiene al desmontar
    };
  }, [service]);

  return <AuthContext.Provider value={{ ...state, ready, service }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return value;
}