/**
 * Bus de eventos interno (sin depender de `window`, para que funcione igual en las pruebas).
 *   DATA          los datos visibles cambiaron (se bajaron cambios, se cambió de espacio, terminó un paso de migración)
 *   LOCAL_CHANGE  hubo una escritura local en un espacio con sincronización: conviene sincronizar pronto
 *   STATE         cambió el estado de la sesión o de la sincronización
 */

const bus = new EventTarget();

export const EVENTS = Object.freeze({ DATA: 'data', LOCAL_CHANGE: 'local-change', STATE: 'state' });

export function emit(name, detail) {
  const event = new Event(name);
  event.detail = detail;
  bus.dispatchEvent(event);
}

/** Suscribe una función a un evento; devuelve la función para cancelar la suscripción. */
export function on(name, fn) {
  const handler = (e) => fn(e.detail);
  bus.addEventListener(name, handler);
  return () => bus.removeEventListener(name, handler);
}