// Account-mode storage: the per-account IndexedDB cache, plus bookkeeping so the sync engine
// knows what to push. The UI uses it exactly like local storage; nothing waits for the network.
import { mergeReconciliation } from '../sync/merge';
import { emitRecordsChanged } from './events';

/**
 * @param cache   an IndexedDB storage created for this account (createIndexedDbStorage)
 * @param onLocalChange called after any local write, to schedule a sync
 */
export function createSyncedStorage(cache, { onLocalChange = () => {} } = {}) {
  const stateOf = (id) => cache.getSyncState(id);

  async function markDirty(id) {
    const state = (await stateOf(id)) ?? { id, baseVersion: 0, base: null, role: 'owner', memberCount: 1 };
    if (state.role === 'viewer') return; // viewers cannot change shared data; the engine re-pulls it
    await cache.putSyncState({ ...state, dirty: true, deleted: false });
  }

  async function queuePeople(people) {
    const queued = (await cache.getMeta('peopleDirty')) ?? [];
    const byId = new Map(queued.map((p) => [p.id, p]));
    for (const p of people) byId.set(p.id, { id: p.id, name: p.name });
    await cache.setMeta('peopleDirty', [...byId.values()]);
  }

  return {
    async listReconciliations() {
      const [summaries, states] = await Promise.all([cache.listReconciliations(), cache.listSyncStates()]);
      const byId = new Map(states.map((s) => [s.id, s]));
      return summaries.map((s) => {
        const st = byId.get(s.id);
        return {
          ...s,
          role: st?.role ?? 'owner',
          ownerName: st?.ownerName ?? null,
          shared: (st?.memberCount ?? 1) > 1 || (st?.role ?? 'owner') !== 'owner',
          pending: Boolean(st?.dirty || !st),
        };
      });
    },

    getReconciliation: (id) => cache.getReconciliation(id),

    async saveReconciliation(data) {
      // If sync replaced this record since the screen loaded it, merge instead of overwriting.
      const current = await cache.getReconciliation(data.id);
      let toSave = data;
      let merged = false;
      if (current && (current.syncRev ?? 0) > (data.syncRev ?? 0)) {
        const state = await stateOf(data.id);
        const base = state?.replaced && (state.replaced.syncRev ?? 0) === (data.syncRev ?? 0) ? state.replaced : null;
        toSave = { ...mergeReconciliation(base, data, current).merged, syncRev: current.syncRev };
        merged = true;
      }
      const saved = await cache.saveReconciliation(toSave);
      await markDirty(data.id);
      onLocalChange();
      // Let the open screen pick up the merged copy once it is idle.
      if (merged) setTimeout(() => emitRecordsChanged([data.id]), 0);
      return saved;
    },

    /** Owner: deletes for everyone. Editor/viewer: leaves the share. Applied on next sync. */
    async deleteReconciliation(id) {
      const state = await stateOf(id);
      await cache.deleteReconciliation(id);
      if (!state || state.baseVersion === 0) await cache.deleteSyncState(id); // never reached the server
      else await cache.putSyncState({ ...state, dirty: true, deleted: true });
      onLocalChange();
    },

    listPeople: () => cache.listPeople(),

    async savePerson(person) {
      await cache.savePerson(person);
      await queuePeople([person]);
      onLocalChange();
      return person;
    },

    exportBackup: (opts) => cache.exportBackup(opts),

    async importBackup(data) {
      await cache.importBackup(data);
      for (const rec of data.reconciliations) await markDirty(rec.id);
      await queuePeople(data.people);
      onLocalChange();
    },

    async getAccess(id) {
      const st = await stateOf(id);
      return {
        role: st?.role ?? 'owner',
        ownerName: st?.ownerName ?? null,
        shared: (st?.memberCount ?? 1) > 1 || (st?.role ?? 'owner') !== 'owner',
      };
    },
  };
}
