import { describe, expect, it } from 'vitest';
import { addMonths, cardFieldsFromSaved, carryOverCards, collectSavedCards, notYetAdded, statementDatesFor } from './savedCards';

const card = (name, last4, statementStart, statementEnd, gradientKey = 'ocean') => ({
  id: `${name}-${last4}`, name, last4, statementStart, statementEnd, statementTotalPaise: 100, gradientKey,
});

describe('collectSavedCards', () => {
  it('keeps one entry per card, from the most recent reconciliation first', () => {
    const recs = [
      { periodEnd: '2026-09-30', cards: [card('HDFC Swiggy', '9436', '2026-08-24', '2026-09-23', 'ocean'), card('Old Card', '1111', '2026-09-01', '2026-09-30')] },
      { periodEnd: '2026-10-31', cards: [card('HDFC swiggy ', '9436', '2026-09-24', '2026-10-23', 'rose'), card('Axis ACE', '2222', '2026-09-17', '2026-10-15')] },
    ];
    const saved = collectSavedCards(recs);
    expect(saved.map((c) => [c.name, c.last4])).toEqual([['HDFC swiggy ', '9436'], ['Axis ACE', '2222'], ['Old Card', '1111']]);
    expect(saved[0]).toMatchObject({ gradientKey: 'rose', statementEnd: '2026-10-23' });
  });

  it('leaves out cards already in the reconciliation', () => {
    const saved = collectSavedCards([{ periodEnd: '2026-10-31', cards: [card('A', '1111'), card('B', '2222')] }]);
    expect(notYetAdded(saved, [card('a', '1111')]).map((c) => c.last4)).toEqual(['2222']);
  });
});

describe('statement dates', () => {
  it('adds months, keeping month ends at month end', () => {
    expect(addMonths('2026-10-23', 1)).toBe('2026-11-23');
    expect(addMonths('2026-01-30', 1)).toBe('2026-02-28');
    expect(addMonths('2026-09-30', 1)).toBe('2026-10-31');
    expect(addMonths('2026-12-15', 2)).toBe('2027-02-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('moves the card cycle to the one ending nearest the new period end', () => {
    const saved = { statementStart: '2026-09-24', statementEnd: '2026-10-23' };
    expect(statementDatesFor(saved, '2026-10-24', '2026-11-23')).toEqual({ statementStart: '2026-10-24', statementEnd: '2026-11-23' });
    expect(statementDatesFor(saved, '2026-11-01', '2026-11-30')).toEqual({ statementStart: '2026-10-24', statementEnd: '2026-11-23' });
    // Skipping a month still lands on the right cycle.
    expect(statementDatesFor(saved, '2026-11-24', '2026-12-23')).toEqual({ statementStart: '2026-11-24', statementEnd: '2026-12-23' });
    // Calendar-month cards stay on calendar months.
    expect(statementDatesFor({ statementStart: '2026-09-01', statementEnd: '2026-09-30' }, '2026-10-01', '2026-10-31')).toEqual({
      statementStart: '2026-10-01',
      statementEnd: '2026-10-31',
    });
  });

  it('falls back to the reconciliation period without usable card dates', () => {
    expect(statementDatesFor({ statementEnd: '' }, '2026-10-01', '2026-10-31')).toEqual({ statementStart: '2026-10-01', statementEnd: '2026-10-31' });
  });
});

describe('carrying cards over', () => {
  const period = { periodStart: '2026-10-24', periodEnd: '2026-11-23' };

  it('starts the statement total at zero and keeps the colour when it is free', () => {
    const saved = collectSavedCards([{ periodEnd: '2026-10-23', cards: [card('HDFC', '9436', '2026-09-24', '2026-10-23', 'rose')] }])[0];
    expect(cardFieldsFromSaved(saved, period, [])).toEqual({
      name: 'HDFC',
      last4: '9436',
      statementStart: '2026-10-24',
      statementEnd: '2026-11-23',
      statementTotalPaise: 0,
      gradientKey: 'rose',
    });
    expect(cardFieldsFromSaved(saved, period, [{ gradientKey: 'rose' }]).gradientKey).not.toBe('rose');
  });

  it('creates fresh cards with new ids and distinct colours', () => {
    const saved = collectSavedCards([
      { periodEnd: '2026-10-23', cards: [card('A', '1111', '2026-09-24', '2026-10-23', 'ocean'), card('B', '2222', '2026-09-24', '2026-10-23', 'ocean')] },
    ]);
    const cards = carryOverCards(saved, period);
    expect(cards).toHaveLength(2);
    expect(cards[0].id).not.toBe('A-1111');
    expect(new Set(cards.map((c) => c.gradientKey)).size).toBe(2);
    expect(cards.every((c) => c.statementTotalPaise === 0 && c.updatedAt)).toBe(true);
  });
});
