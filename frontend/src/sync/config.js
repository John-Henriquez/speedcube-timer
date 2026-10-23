import * as storage from '../storage/index.js';

const KEY = 'syncConfig';

export function normalizeUrl(url) {
  const clean = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/i.test(clean)) throw new Error('La dirección debe empezar con http:// o https://');
  return clean;
}

export async function getSyncConfig() {
  return (await storage.getMeta(KEY)) ?? { serverUrl: '', token: '' };
}

export const saveSyncConfig = (config) => storage.setMeta(KEY, config);
