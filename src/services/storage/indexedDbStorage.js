import { openDB } from 'idb';
import { toSummary } from './storageInterface';

const DB_NAME = 'ccr';
const DB_VERSION = 1;

let dbPromise;
function getDb() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('reconciliations')) {
        db.createObjectStore('reconciliations', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('people')) {
        db.createObjectStore('people', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

export const indexedDbStorage = {
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
};
