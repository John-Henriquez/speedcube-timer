import { useCallback, useState } from 'react';

const KEY = 'speedcube-timer:settings';
const DEFAULTS = { inspection: false, decimals: 2 };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: los ajustes duran solo la sesión */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
