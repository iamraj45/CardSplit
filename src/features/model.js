// Data model factories. Money is integer paise; dates are ISO "YYYY-MM-DD".
// Only the card name and last four digits are ever stored — never a full card number or CVV.

// v2: added `people` (snapshot of everyone used in this reconciliation) and real `adjustments`.
// v3: every card, transaction, adjustment and person carries `updatedAt`, and the reconciliation's
//     own fields (name, period, report settings) carry `detailsUpdatedAt`, so edits made on two
//     devices can be merged entity by entity (see services/sync/merge.js).
export const SCHEMA_VERSION = 3;

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
export const now = () => new Date().toISOString();

/** Mark an entity as changed now. */
export const touch = (entity, at = now()) => ({ ...entity, updatedAt: at });

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
    detailsUpdatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Bring a stored reconciliation up to the current schema. */
export function normalizeReconciliation(rec) {
  if (!rec) return rec;
  // Entities from before v3 get the reconciliation's last-saved time as their edit time.
  const fallback = rec.updatedAt ?? rec.createdAt ?? '1970-01-01T00:00:00.000Z';
  const stamped = (e) => (e.updatedAt ? e : { ...e, updatedAt: fallback });
  return {
    ...rec,
    schemaVersion: SCHEMA_VERSION,
    people: (rec.people ?? []).map(stamped),
    cards: (rec.cards ?? []).map(stamped),
    transactions: (rec.transactions ?? []).map((t) => stamped({ split: null, ...t })),
    adjustments: (rec.adjustments ?? []).map((a) => stamped({ split: null, note: '', ...a })),
    reportSettings: { ...DEFAULT_REPORT_SETTINGS, ...rec.reportSettings },
    detailsUpdatedAt: rec.detailsUpdatedAt ?? fallback,
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
    updatedAt: now(),
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
    updatedAt: now(),
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
    updatedAt: now(),
  };
}

export function createPerson({ name }) {
  return { id: newId(), name: name.trim() };
}
