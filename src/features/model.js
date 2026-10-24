// Data model factories. Money is integer paise; dates are ISO "YYYY-MM-DD".
// Only the card name and last four digits are ever stored — never a full card number or CVV.

// v2: added `people` (snapshot of everyone used in this reconciliation) and real `adjustments`.
export const SCHEMA_VERSION = 2;

export const RECONCILIATION_STATUS = {
  DRAFT: 'draft',
  NEEDS_REVIEW: 'needs_review',
  RECONCILED: 'reconciled',
};

export const LAST4_PATTERN = /^\d{4}$/;

export const DEFAULT_REPORT_SETTINGS = {
  itemised: true, // show each person's items and how their share was calculated
};

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export function createReconciliation({ name, periodStart, periodEnd }) {
  const timestamp = now();
  return {
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    name: name.trim(),
    periodStart,
    periodEnd,
    status: RECONCILIATION_STATUS.DRAFT,
    people: [], // { id, name } — keeps names with the data so backups restore correctly
    cards: [],
    transactions: [],
    adjustments: [],
    reportSettings: { ...DEFAULT_REPORT_SETTINGS },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Bring a stored reconciliation up to the current schema. */
export function normalizeReconciliation(rec) {
  if (!rec) return rec;
  return {
    ...rec,
    schemaVersion: SCHEMA_VERSION,
    people: rec.people ?? [],
    cards: rec.cards ?? [],
    transactions: (rec.transactions ?? []).map((t) => ({ split: null, ...t })),
    adjustments: (rec.adjustments ?? []).map((a) => ({ split: null, note: '', ...a })),
    reportSettings: { ...DEFAULT_REPORT_SETTINGS, ...rec.reportSettings },
  };
}

export function createCard({ name, last4, statementStart, statementEnd, statementTotalPaise, gradientKey }) {
  return {
    id: newId(),
    name: name.trim(),
    last4,
    statementStart,
    statementEnd,
    statementTotalPaise,
    gradientKey,
  };
}

export function createTransaction({
  cardId,
  date,
  expenseName,
  amountPaise,
  split = null,
  originalDescription = null,
  source = 'manual', // 'manual' | 'import:pdf' | 'import:csv' | 'import:xlsx'
}) {
  return {
    id: newId(),
    cardId,
    date,
    expenseName: expenseName.trim(),
    originalDescription,
    amountPaise, // negative = refund / credit
    split, // { method, allocations: [{ personId, value }] } — see splitCalculations.js
    source,
  };
}

/** An item outside any card statement; it only affects person totals. */
export function createAdjustment({ name, amountPaise, split = null, note = '' }) {
  return {
    id: newId(),
    name: name.trim(),
    amountPaise,
    split,
    note: note.trim(),
  };
}

export function createPerson({ name }) {
  return { id: newId(), name: name.trim() };
}
