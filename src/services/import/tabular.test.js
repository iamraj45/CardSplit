import { describe, expect, it } from 'vitest';
import { detectHeaderRow, guessMapping, mappingIsUsable, rowsToTransactions } from './tabular';

describe('guessMapping / detectHeaderRow', () => {
  it('finds the header below preamble rows', () => {
    const rows = [
      ['Credit Card Statement'],
      ['Card', 'XXXX1234'],
      [],
      ['Transaction Date', 'Details', 'Amount (INR)', 'Dr/Cr'],
      ['16/09/2026', 'SHOP', '1,792.16', 'Dr'],
    ];
    const header = detectHeaderRow(rows);
    expect(header).toBe(3);
    expect(guessMapping(rows[header])).toMatchObject({ date: 0, description: 1, amount: 2, drcr: 3 });
  });

  it('maps separate debit and credit columns', () => {
    const m = guessMapping(['Date', 'Narration', 'Debit Amount', 'Credit Amount', 'Balance']);
    expect(m).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, amount: null });
    expect(mappingIsUsable(m)).toBe(true);
  });

  it('is unusable without date or amount', () => {
    expect(mappingIsUsable(guessMapping(['Name', 'Notes']))).toBe(false);
  });
});

describe('rowsToTransactions', () => {
  it('handles a single amount column with Dr/Cr suffixes, payments and footer rows', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['16/09/2026', 'MAKEMYTRIP INDIA PVT', '1,792.16 Dr'],
      ['30/09/2026', 'BBPS PAYMENT RECEIVED', '11,882.46 Cr'],
      ['11/10/2026', 'CASHBACK CREDIT', '265.00 Cr'],
      ['', '', ''],
      ['', 'Total', '11,525.21'],
    ];
    const { transactions, skipped } = rowsToTransactions(rows, 0, guessMapping(rows[0]));
    expect(transactions).toEqual([
      { date: '2026-09-16', description: 'MAKEMYTRIP INDIA PVT', amountPaise: 179216, kind: 'charge' },
      { date: '2026-09-30', description: 'BBPS PAYMENT RECEIVED', amountPaise: -1188246, kind: 'payment' },
      { date: '2026-10-11', description: 'CASHBACK CREDIT', amountPaise: -26500, kind: 'credit' },
    ]);
    expect(skipped).toBe(1);
  });

  it('uses a Dr/Cr type column', () => {
    const rows = [
      ['Date', 'Details', 'Amount', 'Type'],
      ['2026-10-01', 'Shop', '500', 'DR'],
      ['2026-10-02', 'Refund', '100', 'CR'],
    ];
    const { transactions } = rowsToTransactions(rows, 0, guessMapping(rows[0]));
    expect(transactions.map((t) => t.amountPaise)).toEqual([50000, -10000]);
  });

  it('uses debit and credit columns', () => {
    const rows = [
      ['Date', 'Narration', 'Debit', 'Credit'],
      ['01-Oct-2026', 'Shop', '1,000.00', ''],
      ['02-Oct-2026', 'Refund', '', '250.50'],
    ];
    const { transactions } = rowsToTransactions(rows, 0, guessMapping(rows[0]));
    expect(transactions.map((t) => [t.date, t.amountPaise])).toEqual([
      ['2026-10-01', 100000],
      ['2026-10-02', -25050],
    ]);
  });

  it('supports Excel numbers, Date cells, serial dates, inverted signs and month-first dates', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      [new Date(2026, 9, 1), 'Shop', -1792.16],
      [46297, 'Refund', 50],
    ];
    const { transactions } = rowsToTransactions(rows, 0, guessMapping(rows[0]), { invertSigns: true });
    expect(transactions.map((t) => [t.date, t.amountPaise])).toEqual([
      ['2026-10-01', 179216],
      ['2026-10-02', -5000],
    ]);
    const us = rowsToTransactions([['Date', 'Amount'], ['10/02/2026', '5']], 0, { date: 0, amount: 1 }, { monthFirst: true });
    expect(us.transactions[0].date).toBe('2026-10-02');
  });

  it('strips times from date cells', () => {
    const { transactions } = rowsToTransactions([['Date', 'Amount'], ['16/09/2026 14:32:10', '10']], 0, { date: 0, amount: 1 });
    expect(transactions[0].date).toBe('2026-09-16');
  });
});
