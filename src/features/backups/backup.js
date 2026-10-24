// JSON backups: the portable, editable copy of reconciliations (a PDF report is view-only).
//
// File shape:
// { format: 'ccr-backup', backupVersion: 1, schemaVersion, exportedAt, reconciliations: [...], people: [...] }
//
// Imports are validated strictly and rebuilt field by field, so only known data is ever stored
// (e.g. nothing but the last four digits of a card can arrive through a backup).

import { LAST4_PATTERN, SCHEMA_VERSION, normalizeReconciliation } from '../model';
import { SPLIT_METHODS } from '../../services/calculations/splitCalculations';
import { deriveStatus } from '../../services/calculations/reconciliation';
import { isValidISODate } from '../../utils/dates';

export const BACKUP_FORMAT = 'ccr-backup';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export function createBackup({ reconciliations, people }, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    reconciliations,
    people,
  };
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** "ccr-backup-2026-10-24.json" or "ccr-march-april-2026-2026-10-24.json" for a single reconciliation. */
export function backupFileName(singleName, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return singleName ? `ccr-${slug(singleName) || 'reconciliation'}-${date}.json` : `ccr-backup-${date}.json`;
}

class BackupError extends Error {}

const fail = (message) => {
  throw new BackupError(message);
};
const isStr = (v) => typeof v === 'string';
const isInt = (v) => Number.isSafeInteger(v);
const optStr = (v, fallback = '') => (isStr(v) ? v : fallback);

function cleanSplit(split, where) {
  if (split == null) return null;
  const methods = Object.values(SPLIT_METHODS);
  if (typeof split !== 'object' || !methods.includes(split.method) || !Array.isArray(split.allocations)) {
    fail(`${where} has an invalid split.`);
  }
  return {
    method: split.method,
    allocations: split.allocations.map((a) => {
      if (!a || !isStr(a.personId) || !(a.value === null || a.value === undefined || isInt(a.value))) {
        fail(`${where} has an invalid split.`);
      }
      return { personId: a.personId, value: a.value ?? null };
    }),
  };
}

function cleanReconciliation(raw, index) {
  if (!raw || typeof raw !== 'object') fail(`Reconciliation ${index + 1} is not valid.`);
  const label = `Reconciliation “${optStr(raw.name, `#${index + 1}`)}”`;
  if (!isStr(raw.id) || !raw.id) fail(`${label} has no id.`);
  if (!isStr(raw.name) || !raw.name.trim()) fail(`${label} has no name.`);
  if (!isValidISODate(raw.periodStart) || !isValidISODate(raw.periodEnd)) fail(`${label} has an invalid period.`);
  const schemaVersion = raw.schemaVersion ?? 1;
  if (!isInt(schemaVersion) || schemaVersion > SCHEMA_VERSION) {
    fail(`${label} was saved by a newer version of the app. Update the app and try again.`);
  }
  for (const key of ['people', 'cards', 'transactions', 'adjustments']) {
    if (raw[key] != null && !Array.isArray(raw[key])) fail(`${label}: “${key}” is not a list.`);
  }

  const people = (raw.people ?? []).map((p, i) => {
    if (!p || !isStr(p.id) || !isStr(p.name) || !p.name.trim()) fail(`${label}: person ${i + 1} is not valid.`);
    return { id: p.id, name: p.name.trim() };
  });

  const cards = (raw.cards ?? []).map((c, i) => {
    const where = `${label}, card ${i + 1}`;
    if (!c || !isStr(c.id) || !isStr(c.name)) fail(`${where} is not valid.`);
    if (!LAST4_PATTERN.test(c.last4 ?? '')) fail(`${where} must have exactly 4 digits for the card number.`);
    if (!isValidISODate(c.statementStart) || !isValidISODate(c.statementEnd)) fail(`${where} has an invalid statement period.`);
    if (!isInt(c.statementTotalPaise)) fail(`${where} has an invalid statement total.`);
    return {
      id: c.id,
      name: c.name,
      last4: c.last4,
      statementStart: c.statementStart,
      statementEnd: c.statementEnd,
      statementTotalPaise: c.statementTotalPaise,
      gradientKey: optStr(c.gradientKey, 'graphite'),
    };
  });
  const cardIds = new Set(cards.map((c) => c.id));

  const transactions = (raw.transactions ?? []).map((t, i) => {
    const where = `${label}, transaction ${i + 1}`;
    if (!t || !isStr(t.id)) fail(`${where} is not valid.`);
    if (!cardIds.has(t.cardId)) fail(`${where} belongs to a card that isn’t in the backup.`);
    if (!isValidISODate(t.date)) fail(`${where} has an invalid date.`);
    if (!isInt(t.amountPaise)) fail(`${where} has an invalid amount.`);
    return {
      id: t.id,
      cardId: t.cardId,
      date: t.date,
      expenseName: optStr(t.expenseName, optStr(t.originalDescription, 'Untitled')),
      originalDescription: isStr(t.originalDescription) ? t.originalDescription : null,
      amountPaise: t.amountPaise,
      split: cleanSplit(t.split, where),
      source: optStr(t.source, 'manual'),
    };
  });

  const adjustments = (raw.adjustments ?? []).map((a, i) => {
    const where = `${label}, adjustment ${i + 1}`;
    if (!a || !isStr(a.id) || !isStr(a.name)) fail(`${where} is not valid.`);
    if (!isInt(a.amountPaise)) fail(`${where} has an invalid amount.`);
    return { id: a.id, name: a.name, amountPaise: a.amountPaise, split: cleanSplit(a.split, where), note: optStr(a.note) };
  });

  const rec = normalizeReconciliation({
    id: raw.id,
    schemaVersion,
    name: raw.name.trim(),
    periodStart: raw.periodStart,
    periodEnd: raw.periodEnd,
    people,
    cards,
    transactions,
    adjustments,
    reportSettings: raw.reportSettings && typeof raw.reportSettings.itemised === 'boolean' ? { itemised: raw.reportSettings.itemised } : undefined,
    createdAt: optStr(raw.createdAt, new Date().toISOString()),
    updatedAt: optStr(raw.updatedAt, new Date().toISOString()),
  });
  return { ...rec, status: deriveStatus(rec) };
}

/**
 * Validate a backup file's text. Returns { ok: true, backup } or { ok: false, error }.
 * backup: { exportedAt, reconciliations, people }
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, error: 'The file is empty.' };
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'The file is too large to be a backup.' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a backup (it isn’t valid JSON).' };
  }
  if (!data || data.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This file is not a Card Reconciliation backup.' };
  }
  if (!isInt(data.backupVersion) || data.backupVersion > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app and try again.' };
  }
  if (!Array.isArray(data.reconciliations)) return { ok: false, error: 'The backup has no reconciliations list.' };
  try {
    const reconciliations = data.reconciliations.map(cleanReconciliation);
    const ids = new Set();
    for (const r of reconciliations) {
      if (ids.has(r.id)) fail(`The backup contains “${r.name}” twice.`);
      ids.add(r.id);
    }
    const people = (Array.isArray(data.people) ? data.people : [])
      .filter((p) => p && isStr(p.id) && isStr(p.name) && p.name.trim())
      .map((p) => ({ id: p.id, name: p.name.trim() }));
    return { ok: true, backup: { exportedAt: optStr(data.exportedAt, null), reconciliations, people } };
  } catch (err) {
    if (err instanceof BackupError) return { ok: false, error: err.message };
    throw err;
  }
}

export const IMPORT_ACTION = { ADD: 'add', SKIP: 'skip', REPLACE: 'replace', COPY: 'copy' };

/** Pair each backed-up reconciliation with any saved one that has the same id. Conflicts default to skip. */
export function planImport(backupReconciliations, existingSummaries) {
  const existing = new Map(existingSummaries.map((s) => [s.id, s]));
  return backupReconciliations.map((rec) => {
    const match = existing.get(rec.id) ?? null;
    return { rec, existing: match, action: match ? IMPORT_ACTION.SKIP : IMPORT_ACTION.ADD };
  });
}

/** Records to save for a plan, plus counts. "Keep both" stores the backup under a new id with " (copy)". */
export function resolvePlan(plan, newId = () => crypto.randomUUID()) {
  const toSave = [];
  const counts = { added: 0, replaced: 0, copied: 0, skipped: 0 };
  for (const { rec, action } of plan) {
    if (action === IMPORT_ACTION.SKIP) counts.skipped++;
    else if (action === IMPORT_ACTION.COPY) {
      toSave.push({ ...rec, id: newId(), name: `${rec.name} (copy)` });
      counts.copied++;
    } else {
      toSave.push(rec);
      counts[action === IMPORT_ACTION.REPLACE ? 'replaced' : 'added']++;
    }
  }
  return { toSave, counts };
}
