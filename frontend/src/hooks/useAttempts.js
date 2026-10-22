import { useCallback, useEffect, useRef, useState } from 'react';
import * as storage from '../storage/index.js';
import { createAttempt } from '../training/attempts.js';

/** Intentos de las zonas de entrenamiento, con persistencia. Orden cronológico. */
export function useAttempts() {
  const [attempts, setAttempts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;

  useEffect(() => {
    let alive = true;
    storage.getAttempts().then((list) => {
      if (!alive) return;
      setAttempts(list);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Valida los datos con createAttempt (lanza si son inválidos) y guarda el intento. */
  const add = useCallback((data) => {
    const attempt = createAttempt(data);
    setAttempts((prev) => [...prev, attempt]);
    storage.saveAttempt(attempt);
    return attempt;
  }, []);

  /** Cambia la validación de un intento (p. ej. el usuario confirma o descarta manualmente). */
  const setValidation = useCallback((id, validation) => {
    const current = attemptsRef.current.find((a) => a.id === id);
    if (!current) return;
    const next = createAttempt({ ...current, validation }); // vuelve a validar los campos
    setAttempts((prev) => prev.map((a) => (a.id === id ? next : a)));
    storage.saveAttempt(next);
  }, []);

  const remove = useCallback((id) => {
    setAttempts((prev) => prev.filter((a) => a.id !== id));
    storage.deleteAttempt(id);
  }, []);

  return { attempts, loaded, add, setValidation, remove };
}
