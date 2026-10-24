// Pure total calculations. Values are integer paise and are never adjusted to force a match.

import { ASSIGNMENT, assignmentState } from './splitCalculations';

export function cardTransactions(rec, cardId) {
  return rec.transactions.filter((t) => t.cardId === cardId);
}

export function sumPaise(items) {
  return items.reduce((sum, t) => sum + t.amountPaise, 0);
}

export function cardTransactionTotal(rec, cardId) {
  return sumPaise(cardTransactions(rec, cardId));
}

/** Statement total minus the sum of entered transactions. 0 means they match. */
export function cardDifference(rec, card) {
  return card.statementTotalPaise - cardTransactionTotal(rec, card.id);
}

export const CARD_STATUS = {
  EMPTY: 'empty',
  MATCHED: 'matched',
  MISMATCH: 'mismatch',
};

export function cardStatus(rec, card) {
  if (cardTransactions(rec, card.id).length === 0) return CARD_STATUS.EMPTY;
  return cardDifference(rec, card) === 0 ? CARD_STATUS.MATCHED : CARD_STATUS.MISMATCH;
}

export function statementGrandTotal(rec) {
  return rec.cards.reduce((sum, c) => sum + c.statementTotalPaise, 0);
}

export function personIdSet(rec) {
  return new Set(rec.people.map((p) => p.id));
}

/** Items (transactions or adjustments) that are not fully and validly assigned. */
export function unassignedItems(rec, items) {
  const known = personIdSet(rec);
  return items.filter((item) => assignmentState(item, known).state !== ASSIGNMENT.ASSIGNED);
}

/**
 * Person-wise totals for a list of items.
 * Returns { byPerson: Map<personId, paise>, assignedPaise, unassignedPaise }.
 * Items that are unassigned or have an invalid split count toward unassignedPaise.
 */
export function personTotals(rec, items) {
  const known = personIdSet(rec);
  const byPerson = new Map();
  let assignedPaise = 0;
  let unassignedPaise = 0;
  for (const item of items) {
    const { state, result } = assignmentState(item, known);
    if (state !== ASSIGNMENT.ASSIGNED) {
      unassignedPaise += item.amountPaise;
      continue;
    }
    assignedPaise += item.amountPaise;
    for (const { personId, paise } of result.shares) {
      byPerson.set(personId, (byPerson.get(personId) ?? 0) + paise);
    }
  }
  return { byPerson, assignedPaise, unassignedPaise };
}

export function cardPersonTotals(rec, cardId) {
  return personTotals(rec, cardTransactions(rec, cardId));
}

/**
 * Consolidated per-person totals across all cards plus external adjustments.
 * Returns rows in people order: { person, cardsPaise, adjustmentsPaise, totalPaise }.
 */
export function consolidatedPersonTotals(rec) {
  const cards = personTotals(rec, rec.transactions);
  const adjustments = personTotals(rec, rec.adjustments);
  const rows = rec.people.map((person) => {
    const cardsPaise = cards.byPerson.get(person.id) ?? 0;
    const adjustmentsPaise = adjustments.byPerson.get(person.id) ?? 0;
    return { person, cardsPaise, adjustmentsPaise, totalPaise: cardsPaise + adjustmentsPaise };
  });
  return {
    rows,
    unassignedCardsPaise: cards.unassignedPaise,
    unassignedAdjustmentsPaise: adjustments.unassignedPaise,
  };
}

/** Whether a person is referenced by any transaction or adjustment split. */
export function isPersonUsed(rec, personId) {
  const uses = (item) => item.split?.allocations?.some((a) => a.personId === personId);
  return rec.transactions.some(uses) || rec.adjustments.some(uses);
}
