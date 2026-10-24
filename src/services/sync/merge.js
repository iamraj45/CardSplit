// Three-way merge of a reconciliation edited in two places (two devices, or two people).
//
//   base   — the version both sides started from (last synced copy)
//   local  — this device's current copy
//   remote — the server's current copy
//
// Collections (people, cards, transactions, adjustments) are merged entity by entity using ids:
//   * changed on one side only        → that side wins
//   * added on either side            → kept
//   * deleted on one side, untouched  → deleted
//   * deleted on one side, edited on the other → the edit is kept (nothing is silently lost)
//   * changed on both sides differently → the later `updatedAt` wins, and it is reported as a conflict
// The reconciliation's own fields (name, period, report settings) are merged the same way,
// using `detailsUpdatedAt`. Nothing here talks to the network; it is a pure function.

import { deriveStatus } from '../calculations/reconciliation';

const COLLECTIONS = [
  ['people', 'person'],
  ['cards', 'card'],
  ['transactions', 'transaction'],
  ['adjustments', 'adjustment'],
];
const DETAIL_FIELDS = ['name', 'periodStart', 'periodEnd', 'reportSettings'];

/** Deterministic JSON for comparison (object key order must not matter). */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
const same = (a, b) => stable(a) === stable(b);

const labelOf = (entity) => entity.expenseName ?? entity.name ?? entity.id;
const later = (a, b) => (a.updatedAt ?? '') > (b.updatedAt ?? '');

function mergeCollection(kind, baseList = [], localList = [], remoteList = [], conflicts) {
  const base = new Map(baseList.map((e) => [e.id, e]));
  const local = new Map(localList.map((e) => [e.id, e]));
  const remote = new Map(remoteList.map((e) => [e.id, e]));

  // Remote order first, then anything that only exists locally, in local order.
  const ids = [...remote.keys(), ...localList.map((e) => e.id).filter((id) => !remote.has(id))];
  const out = [];
  for (const id of ids) {
    const b = base.get(id);
    const l = local.get(id);
    const r = remote.get(id);

    if (l && r) {
      if (same(l, r) || same(l, b)) out.push(r); // identical, or only remote changed
      else if (same(r, b)) out.push(l); // only local changed
      else {
        const keepLocal = later(l, r);
        out.push(keepLocal ? l : r);
        conflicts.push({ kind, id, name: labelOf(keepLocal ? l : r), kept: keepLocal ? 'local' : 'remote' });
      }
    } else if (l) {
      // Not on the server: new locally, or deleted remotely.
      if (!b) out.push(l);
      else if (!same(l, b)) {
        out.push(l); // edited here after being deleted there — keep the edit
        conflicts.push({ kind, id, name: labelOf(l), kept: 'local', deletedElsewhere: true });
      }
    } else if (r) {
      // Not here: new remotely, or deleted locally.
      if (!b) out.push(r);
      else if (!same(r, b)) {
        out.push(r); // edited there after being deleted here — keep the edit
        conflicts.push({ kind, id, name: labelOf(r), kept: 'remote', deletedElsewhere: true });
      }
    }
  }
  return out;
}

function mergeDetails(base, local, remote, conflicts) {
  const changedLocally = DETAIL_FIELDS.some((f) => !same(local[f], base[f]));
  const changedRemotely = DETAIL_FIELDS.some((f) => !same(remote[f], base[f]));
  const pick = (from) => ({
    ...Object.fromEntries(DETAIL_FIELDS.map((f) => [f, from[f]])),
    detailsUpdatedAt: from.detailsUpdatedAt,
  });
  if (!changedLocally) return pick(remote);
  if (!changedRemotely) return pick(local);

  // Both changed: merge field by field; a field changed on both sides goes to the later edit.
  const localWins = (local.detailsUpdatedAt ?? '') > (remote.detailsUpdatedAt ?? '');
  const out = {};
  for (const f of DETAIL_FIELDS) {
    const l = !same(local[f], base[f]);
    const r = !same(remote[f], base[f]);
    if (l && r && !same(local[f], remote[f])) {
      out[f] = localWins ? local[f] : remote[f];
      conflicts.push({ kind: 'details', id: f, name: f, kept: localWins ? 'local' : 'remote' });
    } else {
      out[f] = l ? local[f] : remote[f];
    }
  }
  out.detailsUpdatedAt = localWins ? local.detailsUpdatedAt : remote.detailsUpdatedAt;
  return out;
}

/** Keep cards and people that merged transactions/adjustments still refer to. */
function restoreReferences(merged, base, local, remote) {
  const find = (key, id) =>
    [local, remote, base].map((r) => r?.[key]?.find((e) => e.id === id)).find(Boolean);

  const cardIds = new Set(merged.cards.map((c) => c.id));
  for (const t of merged.transactions) {
    if (!cardIds.has(t.cardId)) {
      const card = find('cards', t.cardId);
      if (card) {
        merged.cards.push(card);
        cardIds.add(card.id);
      }
    }
  }
  merged.transactions = merged.transactions.filter((t) => cardIds.has(t.cardId));

  const personIds = new Set(merged.people.map((p) => p.id));
  for (const item of [...merged.transactions, ...merged.adjustments]) {
    for (const a of item.split?.allocations ?? []) {
      if (!personIds.has(a.personId)) {
        const person = find('people', a.personId);
        if (person) {
          merged.people.push(person);
          personIds.add(person.id);
        }
      }
    }
  }
}

/**
 * Merge `local` and `remote`, both descended from `base` (null if the record never synced).
 * Returns { merged, conflicts: [{ kind, id, name, kept: 'local' | 'remote', deletedElsewhere? }] }.
 */
export function mergeReconciliation(base, local, remote) {
  const conflicts = [];
  const b = base ?? { people: [], cards: [], transactions: [], adjustments: [] };
  const merged = {
    ...remote,
    ...mergeDetails(b, local, remote, conflicts),
  };
  for (const [key, kind] of COLLECTIONS) {
    merged[key] = mergeCollection(kind, b[key], local[key], remote[key], conflicts);
  }
  restoreReferences(merged, b, local, remote);
  merged.updatedAt = [local.updatedAt, remote.updatedAt].sort().at(-1);
  merged.status = deriveStatus(merged);
  return { merged, conflicts };
}

export { same as sameData };
