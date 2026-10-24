import { describe, expect, it } from 'vitest';
import { DUPLICATE, buildReviewRows, checkRow } from './reviewRows';

const parsed = [
  { date: '2026-09-16', description: 'MAKEMYTRIP INDIA PVT,NEW DELHI', amountPaise: 179216, kind: 'charge' },
  { date: '2026-09-30', description: 'BBPS PAYMENT RECEIVED', amountPaise: -1188246, kind: 'payment' },
  { date: '2026-10-10', description: 'AIRTEL PAYMENTS BANK LTD,GURGAON', amountPaise: 34900, kind: 'charge' },
  { date: '2026-10-10', description: 'AIRTEL PAYMENTS BANK LTD,GURGAON', amountPaise: 34900, kind: 'charge' },
  { date: '2026-10-11', description: 'CASHBACK CREDIT SEP26', amountPaise: -26500, kind: 'credit' },
];

describe('buildReviewRows', () => {
  it('suggests names, excludes payments and flags duplicates', () => {
    const rows = buildReviewRows(parsed, [{ date: '2026-09-16', amountPaise: 179216 }]);
    expect(rows.map((r) => [r.expenseName, r.include, r.duplicate])).toEqual([
      ['Makemytrip', false, DUPLICATE.EXISTING],
      ['BBPS Payment Received', false, null],
      ['Airtel Payments Bank', true, null],
      ['Airtel Payments Bank', true, DUPLICATE.IN_FILE],
      ['Cashback Credit', true, null],
    ]);
    expect(rows[4].amountInput).toBe('-265.00');
  });
});

describe('checkRow', () => {
  it('validates edits', () => {
    const [row] = buildReviewRows(parsed);
    expect(checkRow(row)).toEqual({ amountPaise: 179216, errors: [] });
    expect(checkRow({ ...row, amountInput: 'x', expenseName: ' ', date: '' }).errors).toEqual([
      'Invalid date',
      'Expense name required',
      'Invalid amount',
    ]);
  });
});
