import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  IMPORT_ACTION,
  backupFileName,
  createBackup,
  parseBackup,
  planImport,
  resolvePlan,
} from './backup';
import { SCHEMA_VERSION } from '../model';

const T = '2026-10-01T12:00:00.000Z';
const rec = (overrides = {}) => ({
  id: 'r1',
  schemaVersion: SCHEMA_VERSION,
  name: 'March – April 2026',
  periodStart: '2026-03-15',
  periodEnd: '2026-04-14',
  status: 'draft',
  people: [{ id: 'ak', name: 'Akansha', updatedAt: T }],
  cards: [
    { id: 'c1', name: 'HDFC', last4: '4821', statementStart: '2026-03-15', statementEnd: '2026-04-14', statementTotalPaise: 10000, gradientKey: 'ocean', updatedAt: T },
  ],
  transactions: [
    {
      id: 't1',
      cardId: 'c1',
      date: '2026-03-20',
      expenseName: 'Dentist',
      originalDescription: 'DENTAL CLINIC',
      amountPaise: 10000,
      split: { method: 'single', allocations: [{ personId: 'ak', value: null }] },
      source: 'import:pdf',
      updatedAt: T,
    },
  ],
  adjustments: [{ id: 'a1', name: 'Slice', amountPaise: 54100, split: null, note: 'EMI', updatedAt: T }],
  detailsUpdatedAt: T,
  reportSettings: { itemised: false },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  ...overrides,
});

const text = (reconciliations, extra = {}) =>
  JSON.stringify({ ...createBackup({ reconciliations, people: [{ id: 'ak', name: 'Akansha' }] }), ...extra });

describe('backup round trip', () => {
  it('restores exactly what was exported, with status recomputed', () => {
    const result = parseBackup(text([rec()]));
    expect(result.ok).toBe(true);
    const restored = result.backup.reconciliations[0];
    // status is recomputed from the data, not trusted from the file (the adjustment is unassigned)
    expect(restored).toEqual({ ...rec(), status: 'needs_review' });
    expect(result.backup.people).toEqual([{ id: 'ak', name: 'Akansha' }]);
  });

  it('names files by date and reconciliation', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    expect(backupFileName(null, now)).toBe('cardsplit-backup-2026-10-24.json');
    expect(backupFileName('March – April 2026', now)).toBe('cardsplit-march-april-2026-2026-10-24.json');
  });
});

describe('parseBackup validation', () => {
  it.each([
    ['', 'The file is empty.'],
    ['not json', 'This file is not a backup (it isn’t valid JSON).'],
    ['{"hello":1}', 'This file is not a CardSplit backup.'],
    [JSON.stringify({ format: BACKUP_FORMAT, backupVersion: 99, reconciliations: [] }), 'This backup was made by a newer version of the app. Update the app and try again.'],
    [JSON.stringify({ format: BACKUP_FORMAT, backupVersion: 1 }), 'The backup has no reconciliations list.'],
  ])('rejects %j', (input, error) => {
    expect(parseBackup(input)).toEqual({ ok: false, error });
  });

  it('explains which record is broken', () => {
    const bad = rec();
    bad.transactions[0].amountPaise = 100.5;
    expect(parseBackup(text([bad])).error).toBe('Reconciliation “March – April 2026”, transaction 1 has an invalid amount.');

    const orphan = rec();
    orphan.transactions[0].cardId = 'missing';
    expect(parseBackup(text([orphan])).error).toMatch(/belongs to a card that isn’t in the backup/);

    expect(parseBackup(text([rec(), rec()])).error).toBe('The backup contains “March – April 2026” twice.');
    expect(parseBackup(text([rec({ schemaVersion: SCHEMA_VERSION + 1 })])).error).toMatch(/newer version/);
  });

  it('refuses anything but the last four digits of a card', () => {
    const bad = rec();
    bad.cards[0].last4 = '4111111111111111';
    expect(parseBackup(text([bad])).error).toBe('Reconciliation “March – April 2026”, card 1 must have exactly 4 digits for the card number.');
  });

  it('drops unknown fields', () => {
    const extra = rec({ secret: 'x' });
    extra.cards[0].cvv = '123';
    extra.cards[0].fullNumber = '4111111111111111';
    extra.transactions[0].hack = true;
    const restored = parseBackup(text([extra])).backup.reconciliations[0];
    expect(restored.secret).toBeUndefined();
    expect(Object.keys(restored.cards[0]).sort()).toEqual(
      ['gradientKey', 'id', 'last4', 'name', 'statementEnd', 'statementStart', 'statementTotalPaise', 'updatedAt'].sort(),
    );
    expect(restored.transactions[0].hack).toBeUndefined();
  });

  it('upgrades older schema versions', () => {
    const v1 = rec({ schemaVersion: 1 });
    delete v1.people;
    delete v1.reportSettings;
    v1.transactions[0].split = null;
    const restored = parseBackup(text([v1])).backup.reconciliations[0];
    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.people).toEqual([]);
    expect(restored.reportSettings).toEqual({ itemised: true });
  });
});

describe('planImport / resolvePlan', () => {
  it('adds new reconciliations and skips conflicts by default', () => {
    const plan = planImport([rec(), rec({ id: 'r2', name: 'April – May 2026' })], [{ id: 'r1', name: 'Mine', updatedAt: 'x' }]);
    expect(plan.map((p) => p.action)).toEqual([IMPORT_ACTION.SKIP, IMPORT_ACTION.ADD]);
    expect(plan[0].existing.name).toBe('Mine');
  });

  it('replaces, copies or skips as chosen', () => {
    const plan = planImport([rec(), rec({ id: 'r2' }), rec({ id: 'r3' }), rec({ id: 'r4' })], []);
    plan[0].action = IMPORT_ACTION.REPLACE;
    plan[1].action = IMPORT_ACTION.COPY;
    plan[2].action = IMPORT_ACTION.SKIP;
    const { toSave, counts } = resolvePlan(plan, () => 'new-id');
    expect(counts).toEqual({ added: 1, replaced: 1, copied: 1, skipped: 1 });
    expect(toSave.map((r) => [r.id, r.name])).toEqual([
      ['r1', 'March – April 2026'],
      ['new-id', 'March – April 2026 (copy)'],
      ['r4', 'March – April 2026'],
    ]);
  });
});
