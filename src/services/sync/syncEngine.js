// Background sync between the account's IndexedDB cache and the server.
//
// Each synced record has a sync state { id, base, baseVersion, dirty, deleted, role, ownerName, memberCount }:
//   base/baseVersion — the last copy both sides agreed on; dirty — local changes not yet pushed.
// A sync pass: accept invites (once) → push dirty records (merging on version conflicts) → pull
// what changed on the server (merging into dirty records) → drop records we lost access to →
// sync saved people. Conflicts are resolved by mergeReconciliation and reported, never silent.

import { validateReconciliation } from '../../features/backups/backup';
import { mergeReconciliation, sameData } from './merge';

export const SYNC_STATUS = { IDLE: 'idle', SYNCING: 'syncing', SYNCED: 'synced', OFFLINE: 'offline', ERROR: 'error' };

const MAX_CONFLICT_RETRIES = 3;

/** Network failures (offline, DNS, paused project) as opposed to real errors. */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'TypeError' || err.name === 'AbortError') return true;
  return /fetch|network|timeout|offline|ECONN|503|502|504/i.test(`${err.message ?? ''} ${err.status ?? ''}`);
}

/**
 * @param cache   account IndexedDB storage (getReconciliation, putRaw, deleteReconciliation,
 *                list/get/put/deleteSyncState, getMeta/setMeta, listPeople, savePerson)
 * @param remote  server API (see remote.js): pull, save, remove, myIds, acceptInvites, listPeople, upsertPeople
 * @param emit(ids)            records changed locally because of the server
 * @param onStatus({status, pending, error})
 * @param onConflicts(recId, recName, conflicts)
 * @param onNotice(message)    e.g. "removed from a shared reconciliation"
 * @param isOnline()           navigator.onLine by default
 */
export function createSyncEngine({
  cache,
  remote,
  emit = () => {},
  onStatus = () => {},
  onConflicts = () => {},
  onNotice = () => {},
  // Only an explicit `false` means offline (some environments have a navigator without onLine).
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
}) {
  let running = null;
  let again = false;
  let firstPass = true;
  let lastStatus = { status: SYNC_STATUS.IDLE, pending: 0, error: null };

  const setStatus = (status, extra = {}) => {
    lastStatus = { ...lastStatus, status, ...extra };
    onStatus(lastStatus);
  };

  const pendingCount = async () => (await cache.listSyncStates()).filter((s) => s.dirty).length;

  const accessOf = (row) => ({
    role: row.role,
    ownerName: row.owner_name ?? null,
    memberCount: row.member_count ?? 1,
  });

  /**
   * Write a server-derived copy into the cache. Each such write bumps the local `syncRev`, and the
   * copy it replaced is kept in the sync state, so a screen still editing the older revision can be
   * three-way merged on save instead of overwriting these changes (see syncedStorage).
   */
  async function replaceLocal(id, doc) {
    const old = await cache.getReconciliation(id);
    const next = { ...doc, syncRev: (old?.syncRev ?? 0) + 1 };
    await cache.putRaw(next);
    return { next, replaced: old ?? null };
  }

  /** What is sent to the server: everything except local-only bookkeeping. */
  const forServer = ({ syncRev, ...doc }) => doc; // eslint-disable-line no-unused-vars

  async function dropLocal(id) {
    await cache.deleteReconciliation(id);
    await cache.deleteSyncState(id);
  }

  // --- push -----------------------------------------------------------------------------------

  async function pushOne(state) {
    const { id } = state;
    if (state.deleted) {
      await remote.remove(id);
      await cache.deleteSyncState(id);
      return;
    }
    let st = state;
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const local = await cache.getReconciliation(id);
      if (!local) {
        await cache.deleteSyncState(id);
        return;
      }
      const payload = forServer(local);
      const res = await remote.save(id, payload, st.baseVersion);

      if (res.status === 'ok') {
        const now = await cache.getReconciliation(id);
        const changedMeanwhile = now && now.updatedAt !== local.updatedAt;
        await cache.putSyncState({ ...st, base: payload, baseVersion: res.version, dirty: Boolean(changedMeanwhile), deleted: false });
        return;
      }

      if (res.status === 'conflict') {
        const checked = validateReconciliation(res.data);
        if (!checked.ok) throw new Error(`Server copy of “${local.name}” is invalid: ${checked.error}`);
        const { merged, conflicts } = mergeReconciliation(st.base, payload, checked.rec);
        const { replaced } = await replaceLocal(id, merged);
        st = { ...st, base: checked.rec, baseVersion: res.version, dirty: true, replaced };
        await cache.putSyncState(st);
        if (conflicts.length) onConflicts(id, merged.name, conflicts);
        emit([id]);
        continue; // push the merged copy against the new version
      }

      if (res.status === 'forbidden') {
        // Became a viewer (or was removed): local edits cannot be saved; the server copy is restored on pull.
        await cache.putSyncState({ ...st, dirty: false, baseVersion: 0 });
        await cache.setMeta('lastPulledAt', null); // force a full pull so the server copy replaces ours
        onNotice(`You can no longer edit “${local.name}”. Your recent changes to it were not saved.`);
        return;
      }

      if (res.status === 'deleted' || res.status === 'missing') {
        await dropLocal(id);
        onNotice(`“${local.name}” was deleted by its owner.`);
        emit([id]);
        return;
      }
      throw new Error(`Unexpected save result: ${res.status}`);
    }
    throw new Error('Too many edits at once — will try again shortly.');
  }

  // --- pull -----------------------------------------------------------------------------------

  async function pull() {
    const since = (await cache.getMeta('lastPulledAt')) ?? null;
    const rows = await remote.pull(since);
    let newest = since;
    const changed = [];
    let needsPush = false;

    for (const row of rows) {
      if (!newest || row.updated_at > newest) newest = row.updated_at;
      const st = await cache.getSyncState(row.id);

      if (row.deleted_at) {
        if (st || (await cache.getReconciliation(row.id))) {
          await dropLocal(row.id);
          changed.push(row.id);
        }
        continue;
      }

      const checked = validateReconciliation(row.data);
      if (!checked.ok) {
        console.warn(`Skipping invalid server record ${row.id}: ${checked.error}`);
        continue;
      }
      const access = accessOf(row);

      if (!st || (!st.dirty && row.version > st.baseVersion) || (st.baseVersion === 0 && !st.dirty)) {
        const { replaced } = await replaceLocal(row.id, checked.rec);
        await cache.putSyncState({ id: row.id, base: checked.rec, baseVersion: row.version, dirty: false, deleted: false, replaced, ...access });
        changed.push(row.id);
      } else if (row.version > st.baseVersion) {
        // Changed on both sides: merge now, push the result on the next pass.
        const local = await cache.getReconciliation(row.id);
        const { merged, conflicts } = mergeReconciliation(st.base, local ? forServer(local) : checked.rec, checked.rec);
        const { replaced } = await replaceLocal(row.id, merged);
        await cache.putSyncState({ ...st, ...access, base: checked.rec, baseVersion: row.version, dirty: true, replaced });
        if (conflicts.length) onConflicts(row.id, merged.name, conflicts);
        changed.push(row.id);
        needsPush = true;
      } else if (st.role !== access.role || st.memberCount !== access.memberCount || st.ownerName !== access.ownerName) {
        await cache.putSyncState({ ...st, ...access });
        changed.push(row.id);
      }
    }

    if (newest && newest !== since) await cache.setMeta('lastPulledAt', newest);
    if (changed.length) emit(changed);
    return needsPush;
  }

  /** Remove local copies of shared reconciliations we no longer have access to. */
  async function pruneLostAccess() {
    const ids = new Set(await remote.myIds());
    const removed = [];
    for (const st of await cache.listSyncStates()) {
      if (st.baseVersion > 0 && !st.deleted && !ids.has(st.id)) {
        const rec = await cache.getReconciliation(st.id);
        await dropLocal(st.id);
        removed.push(st.id);
        if (rec && st.role !== 'owner') onNotice(`You no longer have access to “${rec.name}”.`);
      }
    }
    if (removed.length) emit(removed);
  }

  async function syncPeople() {
    const queued = (await cache.getMeta('peopleDirty')) ?? [];
    if (queued.length) {
      await remote.upsertPeople(queued);
      await cache.setMeta('peopleDirty', []);
    }
    const remotePeople = await remote.listPeople();
    const local = new Map((await cache.listPeople()).map((p) => [p.id, p]));
    for (const p of remotePeople) {
      if (!sameData(local.get(p.id), p)) await cache.savePerson({ id: p.id, name: p.name });
    }
  }

  // --- one pass ---------------------------------------------------------------------------------

  async function pass() {
    if (!isOnline()) {
      setStatus(SYNC_STATUS.OFFLINE, { pending: await pendingCount() });
      return;
    }
    setStatus(SYNC_STATUS.SYNCING);
    try {
      if (firstPass) {
        const accepted = await remote.acceptInvites();
        if (accepted > 0) await cache.setMeta('lastPulledAt', null); // pick up newly shared items
      }
      for (let round = 0; round < 3; round++) {
        for (const st of (await cache.listSyncStates()).filter((s) => s.dirty)) await pushOne(st);
        const needsPush = await pull();
        if (!needsPush) break;
      }
      if (firstPass) await pruneLostAccess();
      await syncPeople();
      firstPass = false;
      setStatus(SYNC_STATUS.SYNCED, { pending: await pendingCount(), error: null, lastSyncedAt: new Date().toISOString() });
    } catch (err) {
      const pending = await pendingCount().catch(() => lastStatus.pending);
      if (isNetworkError(err)) setStatus(SYNC_STATUS.OFFLINE, { pending });
      else {
        console.error('Sync failed', err);
        setStatus(SYNC_STATUS.ERROR, { pending, error: err.message ?? String(err) });
      }
    }
  }

  /** Run a sync pass now (coalesces concurrent requests into one follow-up pass). */
  function syncNow() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await pass();
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return { syncNow, getStatus: () => lastStatus };
}
