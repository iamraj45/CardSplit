// Cards remembered from earlier reconciliations, so each new month starts with them.
// They are read from the user's own reconciliations (no separate store), so they sync and back up
// along with them. Only the name, last four digits and colour carry over; the statement total
// starts at zero and is filled in by hand or from an imported statement.

import { createCard } from '../model';
import { nextGradientKey } from '../../theme/cardGradients';
import { storage } from '../../services/storage';
import { isValidISODate } from '../../utils/dates';

const keyOf = (card) => `${card.last4}|${card.name.trim().toLowerCase()}`;

/**
 * Unique cards across reconciliations, most recently used first.
 * Returns [{ key, name, last4, gradientKey, statementStart, statementEnd }].
 */
export function collectSavedCards(recs) {
  const byKey = new Map();
  const ordered = [...recs].sort((a, b) => (b.periodEnd ?? '').localeCompare(a.periodEnd ?? ''));
  for (const rec of ordered) {
    for (const c of rec.cards ?? []) {
      const key = keyOf(c);
      if (!byKey.has(key)) {
        byKey.set(key, { key, name: c.name, last4: c.last4, gradientKey: c.gradientKey, statementStart: c.statementStart, statementEnd: c.statementEnd });
      }
    }
  }
  return [...byKey.values()];
}

/** Saved cards from the reconciliations this user owns (not ones others shared with them). */
export async function loadSavedCards() {
  const summaries = await storage.listReconciliations();
  const own = summaries.filter((s) => !s.role || s.role === 'owner');
  const recs = (await Promise.all(own.map((s) => storage.getReconciliation(s.id)))).filter(Boolean);
  return collectSavedCards(recs);
}

/** Saved cards not already in this list of cards. */
export function notYetAdded(saved, cards) {
  const present = new Set(cards.map(keyOf));
  return saved.filter((s) => !present.has(s.key));
}

// --- statement dates ---------------------------------------------------------------------------

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toISO = (d) => d.toISOString().slice(0, 10);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Add whole months; a month-end date stays at month end, other days are clamped. */
export function addMonths(iso, n) {
  const d = toDate(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + n, 1));
  const last = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(day === daysInMonth(y, m) ? last : Math.min(day, last));
  return toISO(target);
}

const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};

/**
 * The saved card's statement cycle moved to the cycle that ends closest to the new period's end:
 * a card billed 24 Sep – 23 Oct becomes 24 Oct – 23 Nov for an October–November reconciliation.
 * Falls back to the reconciliation period when the card has no usable dates.
 */
export function statementDatesFor(saved, periodStart, periodEnd) {
  if (!isValidISODate(saved.statementEnd) || !isValidISODate(periodEnd)) return { statementStart: periodStart, statementEnd: periodEnd };
  const end = toDate(saved.statementEnd);
  const target = toDate(periodEnd);
  const months = (target.getUTCFullYear() - end.getUTCFullYear()) * 12 + target.getUTCMonth() - end.getUTCMonth();
  const distance = (n) => Math.abs(toDate(addMonths(saved.statementEnd, n)) - target);
  const n = [months - 1, months, months + 1].reduce((best, k) => (distance(k) < distance(best) ? k : best));
  return { statementStart: addDays(addMonths(saved.statementEnd, n - 1), 1), statementEnd: addMonths(saved.statementEnd, n) };
}

/** Card fields for adding a saved card to a reconciliation with the given period and cards. */
export function cardFieldsFromSaved(saved, { periodStart, periodEnd }, existingCards = []) {
  const used = new Set(existingCards.map((c) => c.gradientKey));
  return {
    name: saved.name,
    last4: saved.last4,
    ...statementDatesFor(saved, periodStart, periodEnd),
    statementTotalPaise: 0,
    gradientKey: saved.gradientKey && !used.has(saved.gradientKey) ? saved.gradientKey : nextGradientKey(existingCards),
  };
}

/** New cards for a fresh reconciliation, one per chosen saved card. */
export function carryOverCards(savedList, period) {
  const cards = [];
  for (const saved of savedList) cards.push(createCard(cardFieldsFromSaved(saved, period, cards)));
  return cards;
}
