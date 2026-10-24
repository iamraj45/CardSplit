import { describe, expect, it } from 'vitest';
import { SYNC_STATUS, createSyncEngine } from './syncEngine';
import { createSyncedStorage } from '../storage/syncedStorage';
import { clock, createFakeServer, createMemoryCache } from './testDoubles';

function device(server, uid, opts = {}) {
  const cache = createMemoryCache();
  const log = { conflicts: [], notices: [], emitted: [], status: null };
  let online = true;
  const engine = createSyncEngine({
    cache,
    remote: server.api(uid),
    emit: (ids) => log.emitted.push(...(ids ?? [])),
    onStatus: (s) => (log.status = s),
    onConflicts: (id, name, c) => log.conflicts.push(...c),
    onNotice: (m) => log.notices.push(m),
    isOnline: () => online,
    ...opts,
  });
  const storage = createSyncedStorage(cache);
  return { cache, engine, storage, log, goOffline: () => (online = false), goOnline: () => (online = true) };
}

const T = '2026-10-01T00:00:00.000Z';
const txn = (id, fields = {}) => ({
  id, cardId: 'c1', date: '2026-09-20', expenseName: id, amountPaise: 1000, split: null, source: 'manual', originalDescription: null, updatedAt: T, ...fields,
});
const baseRec = () => ({
  id: 'r1', schemaVersion: 3, name: 'Sept', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'draft',
  people: [{ id: 'ak', name: 'Akansha', updatedAt: T }],
  cards: [{ id: 'c1', name: 'HDFC', last4: '4821', statementStart: '2026-09-01', statementEnd: '2026-09-30', statementTotalPaise: 3000, gradientKey: 'ocean', updatedAt: T }],
  transactions: [txn('t1'), txn('t2'), txn('t3')],
  adjustments: [],
  reportSettings: { itemised: true },
  detailsUpdatedAt: T,
  createdAt: T,
  updatedAt: T,
});
const editTxn = (rec, id, fields) => ({
  ...rec,
  transactions: rec.transactions.map((t) => (t.id === id ? { ...t, ...fields, updatedAt: clock() } : t)),
});

describe('sync engine', () => {
  it('pushes a new reconciliation and marks it clean', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    expect((await a.storage.listReconciliations())[0].pending).toBe(true);

    await a.engine.syncNow();
    expect(server.row('r1').version).toBe(1);
    expect(await a.cache.getSyncState('r1')).toMatchObject({ dirty: false, baseVersion: 1, role: 'owner' });
    expect(a.log.status).toMatchObject({ status: SYNC_STATUS.SYNCED, pending: 0 });
  });

  it('syncs to a second device of the same user', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    const b = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect((await b.cache.getReconciliation('r1')).transactions).toHaveLength(3);
    expect(b.log.emitted).toContain('r1');
  });

  it('merges edits made offline on two devices to different transactions', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    const b = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    await a.engine.syncNow();
    await b.engine.syncNow();

    a.goOffline();
    b.goOffline();
    await a.storage.saveReconciliation(editTxn(await a.cache.getReconciliation('r1'), 't1', { expenseName: 'Dentist' }));
    await b.storage.saveReconciliation(editTxn(await b.cache.getReconciliation('r1'), 't2', { expenseName: 'Groceries' }));
    await a.engine.syncNow();
    expect(a.log.status).toMatchObject({ status: SYNC_STATUS.OFFLINE, pending: 1 });

    a.goOnline();
    b.goOnline();
    await a.engine.syncNow();
    await b.engine.syncNow(); // conflict on push → merge → push merged
    await a.engine.syncNow(); // pulls the merged copy

    for (const d of [a, b]) {
      const names = (await d.cache.getReconciliation('r1')).transactions.map((t) => t.expenseName);
      expect(names).toEqual(['Dentist', 'Groceries', 't3']);
    }
    expect(b.log.conflicts).toEqual([]);
    expect(server.row('r1').version).toBe(3);
  });

  it('does not lose synced changes when an open screen saves an older copy', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    const b = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    await a.engine.syncNow();
    await b.engine.syncNow();

    // Device A's screen holds a copy; it saves an edit to t1 (not yet synced).
    let screen = await a.cache.getReconciliation('r1');
    screen = editTxn(screen, 't1', { expenseName: 'Dentist' });
    await a.storage.saveReconciliation(screen);

    // Meanwhile device B changes t2; A syncs and merges (t1 + t2) into its cache.
    await b.storage.saveReconciliation(editTxn(await b.cache.getReconciliation('r1'), 't2', { expenseName: 'Groceries' }));
    await b.engine.syncNow();
    await a.engine.syncNow();

    // A's screen never reloaded and saves another edit from its stale copy.
    await a.storage.saveReconciliation(editTxn(screen, 't3', { expenseName: 'Hotel' }));
    await a.engine.syncNow();
    await b.engine.syncNow();

    for (const d of [a, b]) {
      const names = (await d.cache.getReconciliation('r1')).transactions.map((t) => t.expenseName);
      expect(names).toEqual(['Dentist', 'Groceries', 'Hotel']);
    }
    expect(server.row('r1').data.syncRev).toBeUndefined(); // local bookkeeping never reaches the server
  });

  it('resolves the same transaction edited on both devices by the later edit and reports it', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    const b = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    await a.engine.syncNow();
    await b.engine.syncNow();

    await a.storage.saveReconciliation(editTxn(await a.cache.getReconciliation('r1'), 't1', { amountPaise: 1111 }));
    await b.storage.saveReconciliation(editTxn(await b.cache.getReconciliation('r1'), 't1', { amountPaise: 2222 })); // later
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect((await a.cache.getReconciliation('r1')).transactions[0].amountPaise).toBe(2222);
    expect(b.log.conflicts).toEqual([{ kind: 'transaction', id: 't1', name: 't1', kept: 'local' }]);
  });

  it('shares with an invited editor and syncs their edits back', async () => {
    const server = createFakeServer();
    server.addUser('owner', 'owner@example.com', 'Abhishek');
    server.addUser('ed', 'ak@example.com', 'Akansha');
    const owner = device(server, 'owner');
    const editor = device(server, 'ed');
    await owner.storage.saveReconciliation(baseRec());
    await owner.engine.syncNow();
    server.invite('r1', 'ak@example.com', 'editor');

    await editor.engine.syncNow(); // accepts the invite on first pass
    const list = await editor.storage.listReconciliations();
    expect(list).toMatchObject([{ id: 'r1', role: 'editor', ownerName: 'Abhishek', shared: true }]);

    await editor.storage.saveReconciliation(editTxn(await editor.cache.getReconciliation('r1'), 't3', { expenseName: 'Hotel' }));
    await editor.engine.syncNow();
    await owner.engine.syncNow();
    expect((await owner.cache.getReconciliation('r1')).transactions[2].expenseName).toBe('Hotel');
    expect((await owner.storage.getAccess('r1')).shared).toBe(true);
  });

  it('keeps viewers read-only and restores the server copy if they lose edit rights mid-edit', async () => {
    const server = createFakeServer();
    server.addUser('owner', 'o@example.com', 'Owner');
    server.addUser('v', 'v@example.com', 'Viewer');
    const owner = device(server, 'owner');
    const member = device(server, 'v');
    await owner.storage.saveReconciliation(baseRec());
    await owner.engine.syncNow();
    server.invite('r1', 'v@example.com', 'editor');
    await member.engine.syncNow();

    // Member edits while still an editor, but is made a viewer before syncing.
    await member.storage.saveReconciliation(editTxn(await member.cache.getReconciliation('r1'), 't1', { expenseName: 'Sneaky' }));
    server.setRole('r1', 'v', 'viewer');
    await member.engine.syncNow();
    expect(member.log.notices[0]).toMatch(/can no longer edit/);
    expect((await member.cache.getReconciliation('r1')).transactions[0].expenseName).toBe('t1');
    expect(server.row('r1').data.transactions[0].expenseName).toBe('t1');

    // As a viewer, local saves are not queued at all.
    await member.storage.saveReconciliation(editTxn(await member.cache.getReconciliation('r1'), 't1', { expenseName: 'Again' }));
    expect((await member.cache.getSyncState('r1')).dirty).toBe(false);
  });

  it('removes a reconciliation everywhere when the owner deletes it', async () => {
    const server = createFakeServer();
    server.addUser('owner', 'o@example.com', 'Owner');
    server.addUser('ed', 'e@example.com', 'Ed');
    const owner = device(server, 'owner');
    const editor = device(server, 'ed');
    await owner.storage.saveReconciliation(baseRec());
    await owner.engine.syncNow();
    server.invite('r1', 'e@example.com', 'editor');
    await editor.engine.syncNow();

    // Editor has an unsynced edit when the owner deletes.
    await editor.storage.saveReconciliation(editTxn(await editor.cache.getReconciliation('r1'), 't1', { expenseName: 'Late' }));
    await owner.storage.deleteReconciliation('r1');
    await owner.engine.syncNow();
    expect(server.row('r1').deleted_at).toBeTruthy();

    await editor.engine.syncNow();
    expect(await editor.cache.getReconciliation('r1')).toBeUndefined();
    expect(editor.log.notices).toEqual(['“Sept” was deleted by its owner.']);
  });

  it('lets a member leave, and prunes copies the user lost access to', async () => {
    const server = createFakeServer();
    server.addUser('owner', 'o@example.com', 'Owner');
    server.addUser('ed', 'e@example.com', 'Ed');
    const owner = device(server, 'owner');
    await owner.storage.saveReconciliation(baseRec());
    await owner.engine.syncNow();
    server.invite('r1', 'e@example.com', 'editor');

    const leaver = device(server, 'ed');
    await leaver.engine.syncNow();
    await leaver.storage.deleteReconciliation('r1');
    await leaver.engine.syncNow();
    expect(server.row('r1').members.has('ed')).toBe(false);
    expect(server.row('r1').deleted_at).toBeNull();

    // A second device of the same user still has a copy; it is pruned on its next session.
    server.invite('r1', 'e@example.com', 'viewer');
    const other = device(server, 'ed');
    await other.engine.syncNow();
    expect(await other.cache.getReconciliation('r1')).toBeTruthy();
    server.removeMember('r1', 'ed');
    const fresh = createSyncEngine({ cache: other.cache, remote: server.api('ed'), onNotice: (m) => other.log.notices.push(m) });
    await fresh.syncNow();
    expect(await other.cache.getReconciliation('r1')).toBeUndefined();
    expect(other.log.notices).toContain('You no longer have access to “Sept”.');
  });

  it('skips invalid server data instead of storing it', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    const b = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    await a.engine.syncNow();
    await b.engine.syncNow();
    server.corrupt('r1');
    await b.engine.syncNow();
    expect((await b.cache.getReconciliation('r1')).transactions).toHaveLength(3);
  });

  it('reports offline when the network fails mid-sync, keeping changes pending', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    server.setOffline(true);
    await a.engine.syncNow();
    expect(a.log.status).toMatchObject({ status: SYNC_STATUS.OFFLINE, pending: 1 });
    server.setOffline(false);
    await a.engine.syncNow();
    expect(a.log.status).toMatchObject({ status: SYNC_STATUS.SYNCED, pending: 0 });
  });

  it('syncs saved people both ways', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    const b = device(server, 'u1');
    await a.storage.savePerson({ id: 'ak', name: 'Akansha' });
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.cache.listPeople()).toEqual([{ id: 'ak', name: 'Akansha' }]);
  });

  it('coalesces overlapping sync requests', async () => {
    const server = createFakeServer();
    const a = device(server, 'u1');
    await a.storage.saveReconciliation(baseRec());
    await Promise.all([a.engine.syncNow(), a.engine.syncNow(), a.engine.syncNow()]);
    expect(server.row('r1').version).toBe(1);
  });
});
