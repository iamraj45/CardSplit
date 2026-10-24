import { describe, expect, it } from 'vitest';
import {
  CARD_STATUS,
  cardDifference,
  cardPersonTotals,
  cardStatus,
  cardTransactionTotal,
  consolidatedPersonTotals,
  isPersonUsed,
  statementGrandTotal,
  unassignedItems,
} from './totals';
import { deriveStatus } from './reconciliation';

const people = [
  { id: 'ak', name: 'Akansha' },
  { id: 'ab', name: 'Abhishek' },
];
const cardA = { id: 'a', statementTotalPaise: 662300 };
const cardB = { id: 'b', statementTotalPaise: 698200 };
const single = (personId) => ({ method: 'single', allocations: [{ personId, value: null }] });
const equal = { method: 'equal', allocations: [{ personId: 'ak' }, { personId: 'ab' }] };
const txn = (cardId, amountPaise, split = null) => ({ id: `${cardId}-${amountPaise}`, cardId, amountPaise, split });

const rec = (transactions, { cards = [cardA, cardB], adjustments = [] } = {}) => ({ people, cards, transactions, adjustments });

describe('card totals', () => {
  it('sums only the given card, including refunds', () => {
    const r = rec([txn('a', 500000), txn('a', 172300), txn('a', -10000), txn('b', 99900)]);
    expect(cardTransactionTotal(r, 'a')).toBe(662300);
    expect(cardTransactionTotal(r, 'b')).toBe(99900);
  });

  it('reports the difference without adjusting anything', () => {
    const r = rec([txn('a', 600000)]);
    expect(cardDifference(r, cardA)).toBe(62300);
    expect(r.transactions[0].amountPaise).toBe(600000);
  });

  it('classifies card status', () => {
    expect(cardStatus(rec([]), cardA)).toBe(CARD_STATUS.EMPTY);
    expect(cardStatus(rec([txn('a', 662300)]), cardA)).toBe(CARD_STATUS.MATCHED);
    expect(cardStatus(rec([txn('a', 662299)]), cardA)).toBe(CARD_STATUS.MISMATCH);
  });

  it('sums statement totals across cards', () => {
    expect(statementGrandTotal(rec([]))).toBe(1360500);
  });
});

describe('person totals', () => {
  it('sums each person per card and tracks unassigned amounts', () => {
    const r = rec([txn('a', 288000, single('ak')), txn('a', 100001, equal), txn('a', 5000), txn('b', 999, single('ab'))]);
    const t = cardPersonTotals(r, 'a');
    expect(t.byPerson.get('ak')).toBe(288000 + 50001);
    expect(t.byPerson.get('ab')).toBe(50000);
    expect(t.assignedPaise).toBe(388001);
    expect(t.unassignedPaise).toBe(5000);
    // person-wise allocations always add up to the assigned card total
    expect([...t.byPerson.values()].reduce((s, v) => s + v, 0)).toBe(t.assignedPaise);
  });

  it('treats invalid splits and removed people as unassigned', () => {
    const bad = { method: 'custom', allocations: [{ personId: 'ak', value: 1 }] };
    const gone = single('someone-removed');
    const r = rec([txn('a', 100, bad), txn('a', 200, gone)]);
    expect(unassignedItems(r, r.transactions)).toHaveLength(2);
    expect(cardPersonTotals(r, 'a').unassignedPaise).toBe(300);
  });

  it('consolidates cards and external adjustments', () => {
    const r = rec([txn('a', 662300, single('ak')), txn('b', 698200, single('ab'))], {
      adjustments: [
        { id: 'p', amountPaise: 100000, split: equal },
        { id: 's', amountPaise: 54100, split: single('ab') },
      ],
    });
    const { rows, unassignedCardsPaise, unassignedAdjustmentsPaise } = consolidatedPersonTotals(r);
    expect(rows.map((row) => [row.person.id, row.cardsPaise, row.adjustmentsPaise, row.totalPaise])).toEqual([
      ['ak', 662300, 50000, 712300],
      ['ab', 698200, 104100, 802300],
    ]);
    expect(unassignedCardsPaise).toBe(0);
    expect(unassignedAdjustmentsPaise).toBe(0);
    // adjustments never change card statement figures
    expect(cardDifference(r, cardA)).toBe(0);
  });

  it('detects whether a person is used', () => {
    const r = rec([txn('a', 100, single('ak'))]);
    expect(isPersonUsed(r, 'ak')).toBe(true);
    expect(isPersonUsed(r, 'ab')).toBe(false);
  });
});

describe('deriveStatus', () => {
  it('is draft with no cards', () => {
    expect(deriveStatus(rec([], { cards: [] }))).toBe('draft');
  });

  it('needs review until every card matches', () => {
    expect(deriveStatus(rec([txn('a', 662300, single('ak'))]))).toBe('needs_review');
  });

  it('needs review while anything is unassigned', () => {
    expect(deriveStatus(rec([txn('a', 662300), txn('b', 698200, single('ab'))]))).toBe('needs_review');
    const withAdj = rec([txn('a', 662300, single('ak')), txn('b', 698200, single('ab'))], {
      adjustments: [{ id: 'x', amountPaise: 100, split: null }],
    });
    expect(deriveStatus(withAdj)).toBe('needs_review');
  });

  it('is reconciled when every card matches and everything is assigned', () => {
    expect(deriveStatus(rec([txn('a', 662300, single('ak')), txn('b', 698200, equal)]))).toBe('reconciled');
  });
});
