/**
 * Llamadas al backend de cuentas. Cada error se devuelve como ApiError con un mensaje legible, un código estable
 * (`code`) y, si aplica, los errores por campo (`fields`). Un fallo de red es ApiError con status 0.
 */
export class ApiError extends Error {
  constructor(status, body = {}) {
    const fields = Object.fromEntries(Object.entries(body).filter(([, v]) => Array.isArray(v) && v.every((x) => typeof x === 'string')));
    const first = Object.values(fields)[0]?.[0];
    super(body.detail ?? first ?? (status === 0 ? 'No se pudo conectar con el servidor.' : `El servidor respondió ${status}.`));
    this.status = status;
    this.code = body.code ?? (status === 0 ? 'network' : null);
    this.fields = fields;
  }
}

export function createApi({ serverUrl, fetchImpl = (...args) => fetch(...args), timeoutMs = 15000 }) {
  async function request(path, { method = 'POST', body, token } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${serverUrl}/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Token ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0);
    } finally {
      clearTimeout(timer);
    }
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  return {
    health: () => request('health/', { method: 'GET' }),
    register: ({ username, email, password, displayName }) =>
      request('auth/register/', { body: { username, email, password, ...(displayName ? { display_name: displayName } : {}) } }),
    login: (identifier, password) => request('auth/login/', { body: { identifier, password } }),
    google: (credential) => request('auth/google/', { body: { credential } }),
    linkGoogle: (token, credential) => request('auth/google/link/', { body: { credential }, token }),
    unlinkGoogle: (token) => request('auth/google/unlink/', { token }),
    logout: (token) => request('auth/logout/', { token }),
    me: (token) => request('auth/me/', { method: 'GET', token }),
    updateProfile: (token, displayName) => request('auth/me/', { method: 'PATCH', body: { display_name: displayName }, token }),
    changePassword: (token, oldPassword, newPassword) =>
      request('auth/password/change/', { body: { old_password: oldPassword, new_password: newPassword }, token }),
    requestReset: (email) => request('auth/password-reset/', { body: { email } }),
    confirmReset: ({ uid, token, password }) => request('auth/password-reset/confirm/', { body: { uid, token, password } }),
  };
}