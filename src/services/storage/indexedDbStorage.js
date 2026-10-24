import { openDB } from 'idb';
import { toSummary } from './storageInterface';

const DB_VERSION = 2;

/**
 * IndexedDB storage. `ccr` holds local-only data; each signed-in account gets its own
 * database (`ccr-<userId>`) used as the offline cache for synced data, so accounts never mix.
 *
 * v1: reconciliations, people. v2: syncState (per-record sync bookkeeping) and meta (key/value).
 */
export function createIndexedDbStorage(dbName = 'ccr') {
  let dbPromise;
  const getDb = () => {
    dbPromise ??= openDB(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('reconciliations')) db.createObjectStore('reconciliations', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('syncState')) db.createObjectStore('syncState', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      },
    });
    return dbPromise;
  };

  return {
    dbName,

    async listReconciliations() {
      const all = await (await getDb()).getAll('reconciliations');
      return all.map(toSummary).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    },

    async getReconciliation(id) {
      return (await getDb()).get('reconciliations', id);
    },

    async saveReconciliation(data) {
      const record = { ...data, updatedAt: new Date().toISOString() };
      await (await getDb()).put('reconciliations', record);
      return record;
    },

    async deleteReconciliation(id) {
      await (await getDb()).delete('reconciliations', id);
    },

    async listPeople() {
      const all = await (await getDb()).getAll('people');
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },

    async savePerson(person) {
      await (await getDb()).put('people', person);
      return person;
    },

    /** Full records for a backup: all reconciliations (or just `ids`) plus saved people. */
    async exportBackup({ ids } = {}) {
      const db = await getDb();
      const all = await db.getAll('reconciliations');
      const reconciliations = ids ? all.filter((r) => ids.includes(r.id)) : all;
      return { reconciliations, people: await db.getAll('people') };
    },

    /**
     * Save validated, conflict-resolved records in one transaction (all or nothing).
     * Saved people are only added when missing, so names already on this device win.
     */
    async importBackup({ reconciliations, people }) {
      const db = await getDb();
      const tx = db.transaction(['reconciliations', 'people'], 'readwrite');
      const peopleStore = tx.objectStore('people');
      const existingPeople = new Set(await peopleStore.getAllKeys());
      await Promise.all([
        ...reconciliations.map((r) => tx.objectStore('reconciliations').put(r)),
        ...people.filter((p) => !existingPeople.has(p.id)).map((p) => peopleStore.put(p)),
        tx.done,
      ]);
    },

    // --- Low-level access used by the sync engine (not part of the UI-facing interface) ---

    /** Store a record exactly as given (no updatedAt bump) — used for data pulled from the server. */
    async putRaw(record) {
      await (await getDb()).put('reconciliations', record);
    },
    async getSyncState(id) {
      return (await getDb()).get('syncState', id);
    },
    async putSyncState(state) {
      await (await getDb()).put('syncState', state);
    },
    async deleteSyncState(id) {
      await (await getDb()).delete('syncState', id);
    },
    async listSyncStates() {
      return (await getDb()).getAll('syncState');
    },
    async getMeta(key) {
      return (await getDb()).get('meta', key);
    },
    async setMeta(key, value) {
      await (await getDb()).put('meta', value, key);
    },
    /** Remove this database entirely (sign-out "remove data from this device"). */
    async destroy() {
      const db = await getDb();
      db.close();
      dbPromise = null;
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(dbName);
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
        req.onblocked = resolve;
      });
    },
  };
}

/** Local-only storage (no account). */
export const indexedDbStorage = createIndexedDbStorage('ccr');
