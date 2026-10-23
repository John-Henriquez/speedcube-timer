import { useCallback, useEffect, useRef, useState } from 'react';
import * as storage from '../storage/index.js';
import { SYNCED_EVENT } from '../sync/events.js';

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Solves de la sesión actual, con persistencia. Orden cronológico (el último es el más reciente). */
export function useSolves() {
  const [solves, setSolves] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const solvesRef = useRef(solves);
  solvesRef.current = solves;

  const reload = useCallback(async () => {
    const list = await storage.getSolves();
    setSolves(list);
    setLoaded(true);
  }, []);

  // Carga inicial y recarga cuando una sincronización trae datos nuevos.
  useEffect(() => {
    reload();
    window.addEventListener(SYNCED_EVENT, reload);
    return () => window.removeEventListener(SYNCED_EVENT, reload);
  }, [reload]);

  const add = useCallback((data) => {
    const solve = {
      id: newId(),
      date: new Date().toISOString(),
      puzzle: '3x3',
      session: 'default',
      penalty: null,
      ...data,
    };
    setSolves((prev) => [...prev, solve]);
    storage.saveSolve(solve);
  }, []);

  /** Activa la penalización indicada; si ya estaba activa, la quita. */
  const togglePenalty = useCallback((id, penalty) => {
    const current = solvesRef.current.find((s) => s.id === id);
    if (!current) return;
    const next = { ...current, penalty: current.penalty === penalty ? null : penalty };
    setSolves((prev) => prev.map((s) => (s.id === id ? next : s)));
    storage.saveSolve(next);
  }, []);

  const remove = useCallback((id) => {
    setSolves((prev) => prev.filter((s) => s.id !== id));
    storage.deleteSolve(id);
  }, []);

  const removeMany = useCallback((ids) => {
    const set = new Set(ids);
    setSolves((prev) => prev.filter((s) => !set.has(s.id)));
    ids.forEach((id) => storage.deleteSolve(id));
  }, []);

  const clear = useCallback(() => {
    setSolves([]);
    storage.clearSolves();
  }, []);

  return { solves, loaded, reload, add, togglePenalty, remove, removeMany, clear };
}
