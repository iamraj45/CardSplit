import { describe, expect, it } from 'vitest';
import { buildReport } from './buildReport';
import { buildReportText } from './reportText';
import { deriveStatus } from '../../services/calculations/reconciliation';
import { SEVERITY, runChecks } from '../../services/calculations/checks';

const single = (personId) => ({ method: 'single', allocations: [{ personId, value: null }] });
const equal = { method: 'equal', allocations: [{ personId: 'ak', value: null }, { personId: 'ab', value: null }] };
const pct = (a, b) => ({ method: 'percentage', allocations: [{ personId: 'ak', value: a }, { personId: 'ab', value: b }] });
const custom = (a, b) => ({ method: 'custom', allocations: [{ personId: 'ak', value: a }, { personId: 'ab', value: b }] });
let n = 0;
const txn = (cardId, date, expenseName, amountPaise, split, extra = {}) => ({
  id: `t${++n}`,
  cardId,
  date,
  expenseName,
  amountPaise,
  split,
  originalDescription: null,
  ...extra,
});

function fixture(overrides = {}) {
  const rec = {
    name: 'March – April 2026',
    periodStart: '2026-03-15',
    periodEnd: '2026-04-14',
    people: [
      { id: 'ak', name: 'Akansha' },
      { id: 'ab', name: 'Abhishek' },
    ],
    cards: [
      { id: 'hdfc', name: 'HDFC Swiggy Credit Card', last4: '4821', statementTotalPaise: 662300, statementStart: '2026-03-15', statementEnd: '2026-04-14' },
      { id: 'icici', name: 'ICICI Credit Card', last4: '1234', statementTotalPaise: 698200, statementStart: '2026-03-15', statementEnd: '2026-04-14' },
    ],
    transactions: [
      txn('hdfc', '2026-03-16', 'Dentist', 288000, single('ak')),
      txn('hdfc', '2026-03-20', 'Groceries', 100001, equal),
      txn('hdfc', '2026-03-25', 'Hotel', 274299, pct(6000, 4000)),
      txn('hdfc', '2026-03-28', 'Refund', -10000, custom(-6000, -4000)),
      txn('hdfc', '2026-04-01', 'Recharge', 10000, single('ab')),
      txn('icici', '2026-03-18', 'Dentist', 288000, single('ak')),
      txn('icici', '2026-03-22', 'Hotel', 410200, single('ab')),
    ],
    adjustments: [
      { id: 'a1', name: 'Pondicherry', amountPaise: 100000, split: equal, note: '' },
      { id: 'a2', name: 'Slice', amountPaise: 54100, split: single('ab'), note: '' },
    ],
    ...overrides,
  };
  return { ...rec, status: deriveStatus(rec) };
}

describe('buildReport', () => {
  it('itemises each person’s share per card with the calculation', () => {
    const report = buildReport(fixture());
    const hdfc = report.cards[0];
    expect(hdfc.persons.map((p) => [p.person.name, p.totalPaise])).toEqual([
      ['Akansha', 496580],
      ['Abhishek', 165720],
    ]);
    expect(hdfc.persons[0].items.map((i) => [i.name, i.sharePaise, i.detail])).toEqual([
      ['Dentist', 288000, ''],
      ['Groceries', 50001, '₹1,000.01 ÷ 2'],
      ['Hotel', 164579, '60% of ₹2,742.99'],
      ['Refund', -6000, 'share of -₹100'],
    ]);
    // person subtotals add up to the card
    expect(hdfc.persons.reduce((s, p) => s + p.totalPaise, 0)).toBe(hdfc.enteredPaise);
    expect(report.grandTotalPaise).toBe(662300 + 698200 + 154100);
    expect(report.statusLabel).toBe('Reconciled');
    expect(report.issues).toEqual([]);
  });
});

describe('buildReportText', () => {
  it('produces the compact shareable layout', () => {
    expect(buildReportText(buildReport(fixture()))).toBe(
      [
        'March – April 2026',
        '',
        'HDFC Swiggy Credit Card •••• 4821 — ₹6,623',
        'Akansha: ₹4,965.80 (Dentist ₹2,880 + Groceries ₹500.01 + Hotel ₹1,645.79 − Refund ₹60)',
        'Abhishek: ₹1,657.20 (Groceries ₹500 + Hotel ₹1,097.20 − Refund ₹40 + Recharge ₹100)',
        '',
        'ICICI Credit Card •••• 1234 — ₹6,982',
        'Akansha: ₹2,880 (Dentist)',
        'Abhishek: ₹4,102 (Hotel)',
        '',
        'External adjustments',
        'Pondicherry: ₹1,000 — Akansha ₹500, Abhishek ₹500',
        'Slice: ₹541 — Abhishek',
        '',
        'Consolidated totals',
        'Akansha: ₹8,345.80 (cards ₹7,845.80 + adjustments ₹500)',
        'Abhishek: ₹6,800.20 (cards ₹5,759.20 + adjustments ₹1,041)',
        '',
        'Reconciliation status: Reconciled',
      ].join('\n'),
    );
  });

  it('has a totals-only mode and lists unassigned items and issues', () => {
    const rec = fixture();
    rec.transactions[4] = { ...rec.transactions[4], split: null }; // Recharge unassigned
    rec.cards[1] = { ...rec.cards[1], statementTotalPaise: 700000 }; // ICICI mismatch
    const text = buildReportText(buildReport({ ...rec, status: deriveStatus(rec) }), { itemised: false });
    expect(text).toContain('Abhishek: ₹1,557.20\nUnassigned: ₹100\n');
    expect(text).toContain('⚠ Entered ₹6,982, differs from statement by ₹18');
    expect(text).toContain('Reconciliation status: Needs review');
    expect(text).toContain('• ICICI Credit Card •••• 1234: transactions don’t match the statement');
    expect(text).toContain('• HDFC Swiggy Credit Card •••• 4821: 1 transaction not assigned');
    expect(text).not.toContain('(Dentist)');
  });
});

describe('runChecks', () => {
  const ids = (rec) => runChecks(rec).map((c) => `${c.severity}:${c.id}`);

  it('reports only informational notes for a clean reconciliation', () => {
    expect(ids(fixture())).toEqual(['info:credits-hdfc']);
  });

  it('flags mismatches, unassigned, invalid splits, duplicates, out-of-period dates and fees', () => {
    const rec = fixture();
    rec.transactions.push(
      txn('icici', '2026-03-22', 'Hotel', 410200, null), // duplicate of Hotel, unassigned
      txn('icici', '2026-05-02', 'Late payment fee', 75000, { method: 'custom', allocations: [{ personId: 'ak', value: 1 }] }),
    );
    rec.adjustments.push({ id: 'a3', name: 'Loan', amountPaise: 5000, split: null, note: '' });
    const found = ids(rec);
    expect(found).toEqual([
      'error:invalid-icici',
      'warning:mismatch-icici',
      'warning:unassigned-icici',
      'warning:dupes-icici',
      'warning:adjustments-unassigned',
      'info:credits-hdfc',
      'info:outside-icici',
      'info:fees-icici',
    ]);
    const mismatch = runChecks(rec).find((c) => c.id === 'mismatch-icici');
    expect(mismatch.diffPaise).toBe(-(410200 + 75000));
  });

  it('warns about empty cards and missing people', () => {
    const rec = fixture({ people: [], transactions: [txn('hdfc', '2026-03-16', 'X', 662300, null)], adjustments: [] });
    const found = runChecks(rec);
    expect(found.map((c) => c.id)).toEqual(expect.arrayContaining(['empty-icici', 'unassigned-hdfc', 'no-people']));
    expect(found.every((c) => c.severity !== SEVERITY.ERROR)).toBe(true);
  });
});
