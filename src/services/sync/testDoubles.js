// In-memory stand-ins for the IndexedDB cache and the Supabase server, used by sync tests.
// The fake server follows the same rules as supabase/migrations/0001_init.sql:
// optimistic versions, owner/editor/viewer roles, soft deletes, invites by email.

let tick = 0;
/** Strictly increasing ISO timestamps, so ordering never depends on the real clock. */
export const clock = () => new Date(Date.UTC(2026, 9, 1, 0, 0, 0, ++tick)).toISOString();

const copy = (x) => (x === undefined ? undefined : structuredClone(x));

export function createMemoryCache() {
  const recs = new Map();
  const people = new Map();
  const states = new Map();
  const meta = new Map();
  return {
    async listReconciliations() {
      return [...recs.values()].map((r) => ({
        id: r.id, name: r.name, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status,
        cardCount: r.cards.length, transactionCount: r.transactions.length, updatedAt: r.updatedAt,
      }));
    },
    async getReconciliation(id) { return copy(recs.get(id)); },
    async saveReconciliation(data) { const r = { ...copy(data), updatedAt: clock() }; recs.set(r.id, r); return copy(r); },
    async deleteReconciliation(id) { recs.delete(id); },
    async listPeople() { return [...people.values()].map(copy); },
    async savePerson(p) { people.set(p.id, copy(p)); return p; },
    async exportBackup() { return { reconciliations: [...recs.values()].map(copy), people: [...people.values()].map(copy) }; },
    async importBackup({ reconciliations, people: ps }) { reconciliations.forEach((r) => recs.set(r.id, copy(r))); ps.forEach((p) => people.has(p.id) || people.set(p.id, copy(p))); },
    async putRaw(r) { recs.set(r.id, copy(r)); },
    async getSyncState(id) { return copy(states.get(id)); },
    async putSyncState(s) { states.set(s.id, copy(s)); },
    async deleteSyncState(id) { states.delete(id); },
    async listSyncStates() { return [...states.values()].map(copy); },
    async getMeta(k) { return copy(meta.get(k)); },
    async setMeta(k, v) { meta.set(k, copy(v)); },
  };
}

export function createFakeServer() {
  const rows = new Map(); // id -> { data, version, updated_at, deleted_at, owner_id, members: Map(user -> {role, at}) }
  const users = new Map(); // id -> { email, name }
  const invites = []; // { recId, email, role, accepted }
  const savedPeople = new Map(); // user -> Map(id -> {id, name})
  let offline = false;

  const fail = () => {
    if (offline) throw new TypeError('Failed to fetch');
  };
  const roleOf = (row, uid) => row?.members.get(uid)?.role ?? null;

  function api(uid) {
    return {
      async pull(since) {
        fail();
        return [...rows.entries()]
          .filter(([, r]) => r.members.has(uid))
          .filter(([, r]) => !since || r.updated_at > since || r.members.get(uid).at > since)
          .map(([id, r]) => ({
            id, data: copy(r.data), version: r.version, updated_at: r.updated_at, deleted_at: r.deleted_at,
            role: roleOf(r, uid), owner_id: r.owner_id, owner_name: users.get(r.owner_id)?.name ?? null, member_count: r.members.size,
          }));
      },
      async save(id, data, expected) {
        fail();
        const r = rows.get(id);
        if (!r) {
          if (expected !== 0) return { status: 'missing' };
          rows.set(id, { data: copy(data), version: 1, updated_at: clock(), deleted_at: null, owner_id: uid, members: new Map([[uid, { role: 'owner', at: clock() }]]) });
          return { status: 'ok', version: 1 };
        }
        const role = roleOf(r, uid);
        if (!role || role === 'viewer') return { status: 'forbidden' };
        if (r.deleted_at) return { status: 'deleted' };
        if (r.version !== expected) return { status: 'conflict', version: r.version, data: copy(r.data) };
        Object.assign(r, { data: copy(data), version: r.version + 1, updated_at: clock() });
        return { status: 'ok', version: r.version };
      },
      async remove(id) {
        fail();
        const r = rows.get(id);
        const role = roleOf(r, uid);
        if (!role) return { status: 'forbidden' };
        if (role === 'owner') {
          Object.assign(r, { deleted_at: clock(), data: {}, version: r.version + 1, updated_at: clock() });
          return { status: 'deleted' };
        }
        r.members.delete(uid);
        return { status: 'left' };
      },
      async myIds() {
        fail();
        return [...rows.entries()].filter(([, r]) => r.members.has(uid)).map(([id]) => id);
      },
      async acceptInvites() {
        fail();
        let n = 0;
        for (const inv of invites) {
          if (!inv.accepted && inv.email === users.get(uid)?.email) {
            rows.get(inv.recId).members.set(uid, { role: inv.role, at: clock() });
            inv.accepted = true;
            n++;
          }
        }
        return n;
      },
      async listPeople() {
        fail();
        return [...(savedPeople.get(uid)?.values() ?? [])].map(copy);
      },
      async upsertPeople(list) {
        fail();
        if (!savedPeople.has(uid)) savedPeople.set(uid, new Map());
        list.forEach((p) => savedPeople.get(uid).set(p.id, { id: p.id, name: p.name }));
      },
    };
  }

  return {
    api,
    addUser(id, email, name) { users.set(id, { email, name }); },
    invite(recId, email, role) { invites.push({ recId, email, role, accepted: false }); },
    setRole(recId, uid, role) { rows.get(recId).members.get(uid).role = role; },
    removeMember(recId, uid) { rows.get(recId).members.delete(uid); },
    row: (id) => rows.get(id),
    corrupt(id) { const r = rows.get(id); Object.assign(r, { data: { nonsense: true }, version: r.version + 1, updated_at: clock() }); },
    setOffline(v) { offline = v; },
  };
}
