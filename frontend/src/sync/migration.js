import { EVENTS, emit } from './events.js';

/**
 * Migración de los datos de un espacio de invitado a una cuenta. Garantías:
 *  - IDEMPOTENTE: se copia por id y lo que ya existe no se toca, así que repetir un paso no duplica ni pisa ediciones.
 *  - REANUDABLE: el estado de cada migración se guarda en el espacio de la cuenta; tras una interrupción continúa.
 *  - SIN PÉRDIDA: el espacio de invitado se "sella" (nadie más lo ve, ni se puede migrar a otra cuenta) y solo se
 *    borra cuando el servidor confirmó TODOS los registros copiados. Si alguno se rechaza, se conserva y se avisa.
 *  - EN SEGUNDO PLANO: se copia por tandas, cediendo el turno entre una y otra, y la app sigue usable.
 *
 * Estados: copying -> uploading -> cleaning -> done   (y error, si el servidor rechazó algún registro)
 */
const META = 'migrations';
const CHUNK = 500;
// Lo que el almanaque guarda solo en el dispositivo (el servidor aún no lo sincroniza). Mismas claves que useAlmanac.
const PROGRESS = 'caseProgress';
const ALGORITHMS = 'userAlgorithms';
const PREFERRED = 'preferredAlgorithm';
const yieldTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

const readAll = async (account) => (await account.getMeta(META)) ?? {};
async function update(account, id, changes) {
  const all = await readAll(account);
  all[id] = { ...all[id], ...changes };
  await account.setMeta(META, all);
  return all[id];
}

/** Une el progreso local del invitado con el de la cuenta sin pisar lo que la cuenta ya tenga. */
async function mergeLocalOnly(guest, account) {
  for (const key of [PROGRESS, ALGORITHMS, PREFERRED]) {
    const mine = await guest.getMeta(key);
    if (!mine) continue;
    const theirs = (await account.getMeta(key)) ?? {};
    if (key === ALGORITHMS) {
      const merged = { ...theirs };
      for (const [caseId, list] of Object.entries(mine)) {
        const known = new Set((merged[caseId] ?? []).map((a) => a.id ?? a.notation));
        merged[caseId] = [...(merged[caseId] ?? []), ...list.filter((a) => !known.has(a.id ?? a.notation))];
      }
      await account.setMeta(key, merged);
    } else {
      await account.setMeta(key, { ...mine, ...theirs }); // lo de la cuenta gana
    }
  }
}

async function copyPhase({ guest, account, id }) {
  // Los registros ya borrados en el invitado nunca se subieron: no hace falta migrar su "tumba".
  const items = [
    ...(await guest.getSolves()).map((record) => ({ store: 'solves', record })),
    ...(await guest.getAttempts()).map((record) => ({ store: 'attempts', record })),
  ];
  for (let i = 0; i < items.length; i += CHUNK) {
    await account.putMigrated(items.slice(i, i + CHUNK), id);
    emit(EVENTS.DATA); // la lista se va llenando mientras se copia
    await yieldTurn();
  }
  await mergeLocalOnly(guest, account);
  await update(account, id, { status: 'uploading', copiedAt: new Date().toISOString() });
  emit(EVENTS.LOCAL_CHANGE); // hay cola nueva: a sincronizar
}

/**
 * Empieza la migración del espacio de invitado actual hacia la cuenta (si tiene datos). Devuelve la migración o null.
 * Tras sellar, el invitado pasa a tener un espacio nuevo y vacío.
 */
export async function startMigration({ spaces, guest, account, accountId }) {
  const counts = await guest.count();
  if (counts.total === 0) return null;
  const id = `mig:${guest.name}`;
  const migration = await update(account, id, { id, guest: guest.name, status: 'copying', startedAt: new Date().toISOString(), total: counts });
  spaces.sealGuest(accountId, id); // idempotente
  await copyPhase({ guest: spaces.sealedSpace(guest.name), account, id });
  return migration;
}

/** Cierra las migraciones cuyo contenido ya confirmó el servidor y borra su espacio sellado. */
export async function settleMigrations({ spaces, account }) {
  const all = await readAll(account);
  for (const migration of Object.values(all)) {
    let { status } = migration;
    if (status === 'uploading' || status === 'error') {
      const left = await account.countTagged(migration.id);
      if (left.error > 0) {
        if (status !== 'error') await update(account, migration.id, { status: 'error' });
        continue; // se conserva el espacio sellado: hay datos que el servidor no aceptó
      }
      if (left.pending > 0) {
        if (status === 'error') await update(account, migration.id, { status: 'uploading' });
        continue;
      }
      status = 'cleaning';
      await update(account, migration.id, { status });
    }
    if (status === 'cleaning') {
      await spaces.destroySealed(migration.guest); // aquí, y solo aquí, se borra lo local del invitado
      await update(account, migration.id, { status: 'done', completedAt: new Date().toISOString() });
    }
  }
}

/** Continúa lo que quedó a medias (tras recargar, cerrar el navegador o un fallo). */
export async function resumeMigrations({ spaces, account, accountId }) {
  const all = await readAll(account);
  for (const migration of Object.values(all)) {
    if (migration.status === 'copying') {
      spaces.sealGuest(accountId, migration.id);
      await copyPhase({ guest: spaces.sealedSpace(migration.guest), account, id: migration.id });
    }
  }
  await settleMigrations({ spaces, account });
}

/** Estado de las migraciones para la interfaz, con cuántos registros faltan por confirmar. */
export async function listMigrations(account) {
  const out = [];
  for (const migration of Object.values(await readAll(account))) {
    const left = migration.status === 'done' ? { pending: 0, error: 0 } : await account.countTagged(migration.id);
    out.push({ ...migration, remaining: left.pending, rejected: left.error });
  }
  return out;
}