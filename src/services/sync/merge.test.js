import { describe, expect, it } from 'vitest';
import { mergeReconciliation } from './merge';

const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-01T11:00:00.000Z';
const T2 = '2026-10-01T12:00:00.000Z';

const single = (personId) => ({ method: 'single', allocations: [{ personId, value: null }] });
const txn = (id, fields = {}) => ({
  id, cardId: 'c1', date: '2026-09-20', expenseName: id, amountPaise: 1000, split: null, source: 'manual', updatedAt: T0, ...fields,
});

const base = {
  id: 'r1', name: 'Sept', periodStart: '2026-09-01', periodEnd: '2026-09-30',
  reportSettings: { itemised: true }, detailsUpdatedAt: T0, updatedAt: T0,
  people: [{ id: 'ak', name: 'Akansha', updatedAt: T0 }, { id: 'ab', name: 'Abhishek', updatedAt: T0 }],
  cards: [{ id: 'c1', name: 'HDFC', last4: '4821', statementStart: '2026-09-01', statementEnd: '2026-09-30', statementTotalPaise: 3000, gradientKey: 'ocean', updatedAt: T0 }],
  transactions: [txn('t1'), txn('t2'), txn('t3')],
  adjustments: [],
};
const clone = (x) => structuredClone(x);
const edit = (rec, id, fields, at) => ({
  ...rec,
  transactions: rec.transactions.map((t) => (t.id === id ? { ...t, ...fields, updatedAt: at } : t)),
});
const names = (rec) => rec.transactions.map((t) => `${t.id}:${t.expenseName}:${t.amountPaise}`);

describe('mergeReconciliation', () => {
  it('returns remote unchanged when nothing changed locally', () => {
    const remote = edit(base, 't1', { amountPaise: 5000 }, T1);
    const { merged, conflicts } = mergeReconciliation(base, clone(base), remote);
    expect(names(merged)).toEqual(['t1:t1:5000', 't2:t2:1000', 't3:t3:1000']);
    expect(conflicts).toEqual([]);
  });

  it('keeps edits to different transactions from both sides', () => {
    const local = edit(base, 't1', { split: single('ak') }, T1);
    const remote = edit(base, 't2', { expenseName: 'Groceries' }, T2);
    const { merged, conflicts } = mergeReconciliation(base, local, remote);
    expect(merged.transactions.find((t) => t.id === 't1').split).toEqual(single('ak'));
    expect(merged.transactions.find((t) => t.id === 't2').expenseName).toBe('Groceries');
    expect(conflicts).toEqual([]);
  });

  it('keeps additions from both sides (remote order first, then local additions)', () => {
    const local = { ...base, transactions: [...base.transactions, txn('t4', { updatedAt: T1 })] };
    const remote = { ...base, transactions: [...base.transactions, txn('t5', { updatedAt: T1 })] };
    const { merged } = mergeReconciliation(base, local, remote);
    expect(merged.transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't5', 't4']);
  });

  it('applies deletions from either side when the other side did not touch the item', () => {
    const local = { ...base, transactions: base.transactions.filter((t) => t.id !== 't1') };
    const remote = { ...base, transactions: base.transactions.filter((t) => t.id !== 't3') };
    const { merged, conflicts } = mergeReconciliation(base, local, remote);
    expect(merged.transactions.map((t) => t.id)).toEqual(['t2']);
    expect(conflicts).toEqual([]);
  });

  it('keeps an edit when the other side deleted the item, and reports it', () => {
    const local = edit(base, 't1', { amountPaise: 9900 }, T1);
    const remote = { ...base, transactions: base.transactions.filter((t) => t.id !== 't1') };
    const { merged, conflicts } = mergeReconciliation(base, local, remote);
    expect(merged.transactions.find((t) => t.id === 't1').amountPaise).toBe(9900);
    expect(conflicts).toEqual([{ kind: 'transaction', id: 't1', name: 't1', kept: 'local', deletedElsewhere: true }]);
  });

  it('resolves the same item edited on both sides by the later edit', () => {
    const local = edit(base, 't1', { expenseName: 'Mine' }, T2);
    const remote = edit(base, 't1', { expenseName: 'Theirs' }, T1);
    const result = mergeReconciliation(base, local, remote);
    expect(result.merged.transactions[0].expenseName).toBe('Mine');
    expect(result.conflicts).toEqual([{ kind: 'transaction', id: 't1', name: 'Mine', kept: 'local' }]);

    const swapped = mergeReconciliation(base, edit(base, 't1', { expenseName: 'Mine' }, T1), edit(base, 't1', { expenseName: 'Theirs' }, T2));
    expect(swapped.merged.transactions[0].expenseName).toBe('Theirs');
    expect(swapped.conflicts[0].kept).toBe('remote');
  });

  it('treats identical edits on both sides as no conflict', () => {
    const local = edit(base, 't1', { expenseName: 'Same' }, T1);
    const remote = edit(base, 't1', { expenseName: 'Same' }, T1);
    expect(mergeReconciliation(base, local, remote).conflicts).toEqual([]);
  });

  it('merges reconciliation details field by field', () => {
    const local = { ...base, name: 'September 2026', detailsUpdatedAt: T1 };
    const remote = { ...base, reportSettings: { itemised: false }, detailsUpdatedAt: T2 };
    const { merged, conflicts } = mergeReconciliation(base, local, remote);
    expect(merged.name).toBe('September 2026');
    expect(merged.reportSettings).toEqual({ itemised: false });
    expect(conflicts).toEqual([]);

    const both = mergeReconciliation(base, { ...base, name: 'Mine', detailsUpdatedAt: T1 }, { ...base, name: 'Theirs', detailsUpdatedAt: T2 });
    expect(both.merged.name).toBe('Theirs');
    expect(both.conflicts).toEqual([{ kind: 'details', id: 'name', name: 'name', kept: 'remote' }]);
  });

  it('restores a card or person that a surviving item still refers to', () => {
    // Remote deleted the card and person; locally a new transaction uses both.
    const remote = { ...base, cards: [], transactions: [], people: base.people.filter((p) => p.id !== 'ak') };
    const local = { ...base, transactions: [...base.transactions, txn('t9', { split: single('ak'), updatedAt: T1 })] };
    const { merged } = mergeReconciliation(base, local, remote);
    expect(merged.cards.map((c) => c.id)).toEqual(['c1']);
    expect(merged.transactions.map((t) => t.id)).toEqual(['t9']);
    expect(merged.people.map((p) => p.id).sort()).toEqual(['ab', 'ak']);
  });

  it('handles a record that never synced (no base) and recomputes status', () => {
    const local = { ...base, transactions: [txn('t1', { amountPaise: 3000, split: single('ak') })] };
    const remote = { ...base, transactions: [] };
    const { merged } = mergeReconciliation(null, local, remote);
    expect(merged.transactions.map((t) => t.id)).toEqual(['t1']);
    expect(merged.status).toBe('reconciled');
  });

  it('ignores key order when comparing', () => {
    const reordered = { ...base, transactions: base.transactions.map((t) => Object.fromEntries(Object.entries(t).reverse())) };
    expect(mergeReconciliation(base, reordered, base).conflicts).toEqual([]);
  });
});
