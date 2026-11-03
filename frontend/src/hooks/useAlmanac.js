import { useCallback, useEffect, useRef, useState } from 'react';
import * as storage from '../storage/index.js';

const KEYS = { progress: 'caseProgress', algs: 'userAlgorithms', preferred: 'preferredAlgorithm' };

/**
 * Lo que el usuario guarda en el almanaque: estado de aprendizaje de cada caso, variantes personales y
 * algoritmo preferido por caso. De momento vive solo en este dispositivo (no se sincroniza con el servidor).
 */
export function useAlmanac() {
  const [progress, setProgress] = useState({});
  const [userAlgs, setUserAlgs] = useState({});
  const [preferred, setPreferred] = useState({});
  const [loaded, setLoaded] = useState(false);
  const ref = useRef({ progress: {}, algs: {}, preferred: {} });

  useEffect(() => {
    let alive = true;
    Promise.all([storage.getMeta(KEYS.progress), storage.getMeta(KEYS.algs), storage.getMeta(KEYS.preferred)]).then(([p, a, f]) => {
      if (!alive) return;
      ref.current = { progress: p ?? {}, algs: a ?? {}, preferred: f ?? {} };
      setProgress(ref.current.progress);
      setUserAlgs(ref.current.algs);
      setPreferred(ref.current.preferred);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const commit = useCallback((slot, key, setter, next) => {
    ref.current[slot] = next;
    setter(next);
    storage.setMeta(key, next);
  }, []);

  const setStatus = useCallback((caseId, status) => {
    commit('progress', KEYS.progress, setProgress, { ...ref.current.progress, [caseId]: status });
  }, [commit]);

  const addUserAlgorithm = useCallback((caseId, alg) => {
    const list = ref.current.algs[caseId] ?? [];
    commit('algs', KEYS.algs, setUserAlgs, { ...ref.current.algs, [caseId]: [...list, alg] });
  }, [commit]);

  const removeUserAlgorithm = useCallback((caseId, algId) => {
    const list = (ref.current.algs[caseId] ?? []).filter((a) => a.id !== algId);
    commit('algs', KEYS.algs, setUserAlgs, { ...ref.current.algs, [caseId]: list });
    if (ref.current.preferred[caseId] === algId) {
      const { [caseId]: _removed, ...rest } = ref.current.preferred;
      commit('preferred', KEYS.preferred, setPreferred, rest);
    }
  }, [commit]);

  /** Marca (o desmarca con null) el algoritmo preferido de un caso. */
  const setPreferredAlgorithm = useCallback((caseId, algId) => {
    const { [caseId]: _old, ...rest } = ref.current.preferred;
    commit('preferred', KEYS.preferred, setPreferred, algId ? { ...rest, [caseId]: algId } : rest);
  }, [commit]);

  return { progress, userAlgs, preferred, loaded, setStatus, addUserAlgorithm, removeUserAlgorithm, setPreferredAlgorithm };
}