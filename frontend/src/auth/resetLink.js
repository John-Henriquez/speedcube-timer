/** Lee `#/reset?uid=...&token=...` (el enlace del correo de recuperación). Devuelve { uid, token } o null. */
export function parseResetHash(hash = '') {
  const match = /^#\/reset\?(.+)$/.exec(hash);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const uid = params.get('uid');
  const token = params.get('token');
  return uid && token ? { uid, token } : null;
}