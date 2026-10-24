// Storage contract. UI and calculation code depend only on this shape (via ./index.js),
// so a future Supabase adapter can replace the IndexedDB one without touching callers.

/**
 * @typedef {Object} ReconciliationSummary
 * @property {string} id
 * @property {string} name
 * @property {string} periodStart
 * @property {string} periodEnd
 * @property {string} status
 * @property {number} cardCount
 * @property {number} transactionCount
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {() => Promise<ReconciliationSummary[]>} listReconciliations
 * @property {(id: string) => Promise<Object|undefined>} getReconciliation
 * @property {(data: Object) => Promise<Object>} saveReconciliation  Returns the saved record (with updatedAt).
 * @property {(id: string) => Promise<void>} deleteReconciliation
 * @property {() => Promise<Object[]>} listPeople
 * @property {(person: Object) => Promise<Object>} savePerson
 * @property {(opts?: { ids?: string[] }) => Promise<{ reconciliations: Object[], people: Object[] }>} exportBackup
 * @property {(data: { reconciliations: Object[], people: Object[] }) => Promise<void>} importBackup
 *   Saves already-validated records (see features/backups/backup.js) atomically.
 */

export const STORAGE_METHODS = [
  'listReconciliations',
  'getReconciliation',
  'saveReconciliation',
  'deleteReconciliation',
  'listPeople',
  'savePerson',
  'exportBackup',
  'importBackup',
];

/** Throws if an adapter is missing any required method. */
export function assertStorageAdapter(adapter) {
  const missing = STORAGE_METHODS.filter((m) => typeof adapter[m] !== 'function');
  if (missing.length) throw new Error(`Storage adapter missing: ${missing.join(', ')}`);
  return adapter;
}

/** Build a dashboard summary from a full reconciliation record. */
export function toSummary(rec) {
  return {
    id: rec.id,
    name: rec.name,
    periodStart: rec.periodStart,
    periodEnd: rec.periodEnd,
    status: rec.status,
    cardCount: rec.cards.length,
    transactionCount: rec.transactions.length,
    updatedAt: rec.updatedAt,
  };
}
