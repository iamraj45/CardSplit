// Single swap point for storage. The UI always calls `storage.*`; which adapter answers depends
// on the session: plain IndexedDB for local-only use, or the synced account cache when signed in.
import { STORAGE_METHODS, assertStorageAdapter } from './storageInterface';
import { indexedDbStorage } from './indexedDbStorage';

let active = indexedDbStorage;

export const storage = {
  ...Object.fromEntries(STORAGE_METHODS.map((method) => [method, (...args) => active[method](...args)])),
  /** Who may do what with a reconciliation: { role: 'owner'|'editor'|'viewer', shared, ownerName }. */
  getAccess: (id) => (active.getAccess ? active.getAccess(id) : Promise.resolve({ role: 'owner', shared: false })),
  /** True when signed in and data syncs with the server. */
  isSynced: () => Boolean(active.getAccess),
};

export function setStorageAdapter(adapter) {
  active = assertStorageAdapter(adapter);
}

/** The local-only adapter, e.g. to offer uploading its data after sign-in. */
export const localStorageAdapter = indexedDbStorage;
