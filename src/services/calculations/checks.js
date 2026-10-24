// Reconciliation checks. Each check reports what it found; nothing is ever adjusted to make
// totals agree. Severity: 'error' (totals are wrong), 'warning' (needs a decision), 'info' (worth a look).

import { ASSIGNMENT, assignmentState } from './splitCalculations';
import { cardDifference, cardPersonTotals, cardTransactions, consolidatedPersonTotals, personIdSet, sumPaise } from './totals';

export const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };

const FEE_PATTERN =
  /\b(interest|finance charge|late (payment )?(fee|charge)|lpc|annual fee|joining fee|renewal fee|over ?limit|penalty|surcharge|gst|igst|cgst|sgst|processing fee|convenience fee|cash advance fee)\b/i;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const describe = (t) => t.expenseName || t.name || t.originalDescription || 'Untitled';

/** Returns [{ id, severity, title, detail, cardId?, itemIds? }], most severe first. */
export function runChecks(rec) {
  const checks = [];
  const known = personIdSet(rec);
  const add = (check) => checks.push(check);

  if (rec.cards.length === 0) {
    add({ id: 'no-cards', severity: SEVERITY.WARNING, title: 'No cards yet', detail: 'Add a card and its statement total.' });
  }

  for (const card of rec.cards) {
    const txns = cardTransactions(rec, card.id);
    const label = `${card.name} •••• ${card.last4}`;

    // 1. Entered transactions vs statement total
    if (txns.length === 0) {
      add({ id: `empty-${card.id}`, severity: SEVERITY.WARNING, cardId: card.id, title: `${label}: no transactions`, detail: 'Import the statement or add transactions.' });
    } else {
      const diff = cardDifference(rec, card);
      if (diff !== 0) {
        add({
          id: `mismatch-${card.id}`,
          severity: SEVERITY.WARNING,
          cardId: card.id,
          title: `${label}: transactions don’t match the statement`,
          diffPaise: diff,
          detail:
            diff > 0
              ? 'Some of the statement total is not accounted for — a transaction may be missing.'
              : 'Entered transactions exceed the statement total — check for duplicates or a payment entered as a charge.',
        });
      }
    }

    // 2. Every transaction fully and validly assigned
    const states = txns.map((t) => ({ t, ...assignmentState(t, known) }));
    const unassigned = states.filter((s) => s.state === ASSIGNMENT.UNASSIGNED).map((s) => s.t);
    const invalid = states.filter((s) => s.state === ASSIGNMENT.INVALID);
    if (unassigned.length) {
      add({
        id: `unassigned-${card.id}`,
        severity: SEVERITY.WARNING,
        cardId: card.id,
        itemIds: unassigned.map((t) => t.id),
        title: `${label}: ${plural(unassigned.length, 'transaction')} not assigned`,
        amountPaise: sumPaise(unassigned),
        detail: unassigned.slice(0, 5).map(describe).join(', ') + (unassigned.length > 5 ? '…' : ''),
      });
    }
    if (invalid.length) {
      add({
        id: `invalid-${card.id}`,
        severity: SEVERITY.ERROR,
        cardId: card.id,
        itemIds: invalid.map((s) => s.t.id),
        title: `${label}: ${plural(invalid.length, 'split')} need fixing`,
        detail: invalid.map((s) => `${describe(s.t)} — ${s.result.error}`).join('; '),
      });
    }

    // 3. Person-wise allocations add up to the assigned card total (integrity check)
    const { byPerson, assignedPaise } = cardPersonTotals(rec, card.id);
    const allocated = [...byPerson.values()].reduce((s, v) => s + v, 0);
    if (allocated !== assignedPaise) {
      add({
        id: `allocation-${card.id}`,
        severity: SEVERITY.ERROR,
        cardId: card.id,
        title: `${label}: person totals don’t add up`,
        detail: `Allocated ${allocated} paise vs assigned ${assignedPaise} paise.`,
      });
    }

    // 4. Possible duplicates: same date and amount on the same card
    const groups = new Map();
    for (const t of txns) {
      const key = `${t.date}|${t.amountPaise}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    const dupes = [...groups.values()].filter((g) => g.length > 1);
    if (dupes.length) {
      add({
        id: `dupes-${card.id}`,
        severity: SEVERITY.WARNING,
        cardId: card.id,
        itemIds: dupes.flat().map((t) => t.id),
        title: `${label}: ${plural(dupes.length, 'possible duplicate')}`,
        detail: dupes.map((g) => `${g.length}× ${describe(g[0])} on ${g[0].date}`).join('; '),
      });
    }

    // 5. Dates outside the statement period
    const outside = txns.filter((t) => t.date < card.statementStart || t.date > card.statementEnd);
    if (outside.length) {
      add({
        id: `outside-${card.id}`,
        severity: SEVERITY.INFO,
        cardId: card.id,
        itemIds: outside.map((t) => t.id),
        title: `${label}: ${plural(outside.length, 'transaction')} dated outside the statement period`,
        detail: 'Usually fine (statements often include earlier-dated items), but worth a glance.',
      });
    }

    // 6. Refunds/credits and fees deserve a deliberate decision about who they belong to
    const credits = txns.filter((t) => t.amountPaise < 0);
    if (credits.length) {
      add({
        id: `credits-${card.id}`,
        severity: SEVERITY.INFO,
        cardId: card.id,
        itemIds: credits.map((t) => t.id),
        title: `${label}: ${plural(credits.length, 'refund or credit')}`,
        amountPaise: sumPaise(credits),
        detail: 'Make sure each one goes to whoever made the original purchase.',
      });
    }
    const fees = txns.filter((t) => t.amountPaise > 0 && FEE_PATTERN.test(`${t.expenseName} ${t.originalDescription ?? ''}`));
    if (fees.length) {
      add({
        id: `fees-${card.id}`,
        severity: SEVERITY.INFO,
        cardId: card.id,
        itemIds: fees.map((t) => t.id),
        title: `${label}: ${plural(fees.length, 'fee, interest or tax line')}`,
        amountPaise: sumPaise(fees),
        detail: 'Decide who pays these charges.',
      });
    }
  }

  // 7. External adjustments
  const adjStates = rec.adjustments.map((a) => ({ a, ...assignmentState(a, known) }));
  const adjUnassigned = adjStates.filter((s) => s.state !== ASSIGNMENT.ASSIGNED);
  if (adjUnassigned.length) {
    add({
      id: 'adjustments-unassigned',
      severity: SEVERITY.WARNING,
      itemIds: adjUnassigned.map((s) => s.a.id),
      title: `${plural(adjUnassigned.length, 'external adjustment')} not assigned`,
      detail: adjUnassigned.map((s) => describe(s.a)).join(', '),
    });
  }

  // 8. Consolidated totals reconcile: everyone's total + unassigned = all card transactions + adjustments
  const { rows, unassignedCardsPaise, unassignedAdjustmentsPaise } = consolidatedPersonTotals(rec);
  const people = rows.reduce((s, r) => s + r.totalPaise, 0);
  const expected = sumPaise(rec.transactions) + sumPaise(rec.adjustments);
  if (people + unassignedCardsPaise + unassignedAdjustmentsPaise !== expected) {
    add({
      id: 'consolidated',
      severity: SEVERITY.ERROR,
      title: 'Consolidated totals don’t add up',
      detail: `People ${people} + unassigned ${unassignedCardsPaise + unassignedAdjustmentsPaise} ≠ ${expected} paise.`,
    });
  }

  if (rec.people.length === 0 && rec.transactions.length > 0) {
    add({ id: 'no-people', severity: SEVERITY.WARNING, title: 'No people added', detail: 'Add the people who share these cards.' });
  }

  const order = { error: 0, warning: 1, info: 2 };
  return checks.sort((a, b) => order[a.severity] - order[b.severity]);
}
