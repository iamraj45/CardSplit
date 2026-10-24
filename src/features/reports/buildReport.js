// Builds the report's data from saved records. The on-screen report and the plain-text
// version both render this structure, so they can never disagree.

import { STATUS_LABELS } from '../../services/calculations/reconciliation';
import { SEVERITY, runChecks } from '../../services/calculations/checks';
import { ASSIGNMENT, SPLIT_METHODS, assignmentState, formatPercent } from '../../services/calculations/splitCalculations';
import { cardDifference, cardTransactions, consolidatedPersonTotals, personIdSet, sumPaise } from '../../services/calculations/totals';
import { formatINR } from '../../utils/currency';

/** How a person's share was worked out, e.g. "₹1,000.01 ÷ 2" or "60% of ₹2,742.99". */
export function shareDetail(item, allocation, method) {
  const amount = formatINR(item.amountPaise, { compact: true });
  switch (method) {
    case SPLIT_METHODS.EQUAL:
      return `${amount} ÷ ${item.split.allocations.length}`;
    case SPLIT_METHODS.PERCENTAGE:
      return `${formatPercent(allocation.value)} of ${amount}`;
    case SPLIT_METHODS.CUSTOM:
      return `share of ${amount}`;
    default:
      return '';
  }
}

const byDate = (a, b) => a.date.localeCompare(b.date) || a.expenseName.localeCompare(b.expenseName);

function personBreakdown(rec, items, nameOf) {
  const known = personIdSet(rec);
  const perPerson = new Map();
  const unassigned = [];
  for (const item of items) {
    const { state, result } = assignmentState(item, known);
    if (state !== ASSIGNMENT.ASSIGNED) {
      unassigned.push(item);
      continue;
    }
    result.shares.forEach((share, i) => {
      const allocation = item.split.allocations[i];
      const entry = {
        id: item.id,
        date: item.date,
        name: nameOf(item),
        amountPaise: item.amountPaise,
        sharePaise: share.paise,
        method: item.split.method,
        detail: shareDetail(item, allocation, item.split.method),
      };
      perPerson.set(share.personId, [...(perPerson.get(share.personId) ?? []), entry]);
    });
  }
  const persons = rec.people
    .filter((p) => perPerson.has(p.id))
    .map((person) => {
      const entries = perPerson.get(person.id);
      return { person, totalPaise: entries.reduce((s, e) => s + e.sharePaise, 0), items: entries };
    });
  return { persons, unassigned: { totalPaise: sumPaise(unassigned), items: unassigned } };
}

export function buildReport(rec) {
  const cards = rec.cards.map((card) => {
    const txns = [...cardTransactions(rec, card.id)].sort(byDate);
    const { persons, unassigned } = personBreakdown(rec, txns, (t) => t.expenseName);
    const enteredPaise = sumPaise(txns);
    return {
      card,
      statementTotalPaise: card.statementTotalPaise,
      enteredPaise,
      differencePaise: cardDifference(rec, card),
      transactionCount: txns.length,
      persons,
      unassigned,
    };
  });

  const names = new Map(rec.people.map((p) => [p.id, p.name]));
  const known = personIdSet(rec);
  const adjustments = rec.adjustments.map((a) => {
    const { state, result } = assignmentState(a, known);
    return {
      adjustment: a,
      assigned: state === ASSIGNMENT.ASSIGNED,
      method: a.split?.method ?? null,
      shares: state === ASSIGNMENT.ASSIGNED ? result.shares.map((s) => ({ name: names.get(s.personId), paise: s.paise })) : [],
    };
  });

  const consolidated = consolidatedPersonTotals(rec);
  const checks = runChecks(rec);
  return {
    name: rec.name,
    periodStart: rec.periodStart,
    periodEnd: rec.periodEnd,
    status: rec.status,
    statusLabel: (STATUS_LABELS[rec.status] ?? STATUS_LABELS.draft).label,
    cards,
    adjustments,
    adjustmentsTotalPaise: sumPaise(rec.adjustments),
    consolidated,
    grandTotalPaise: sumPaise(rec.transactions) + sumPaise(rec.adjustments),
    checks,
    issues: checks.filter((c) => c.severity !== SEVERITY.INFO),
  };
}
