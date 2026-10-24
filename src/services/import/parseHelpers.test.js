import { describe, expect, it } from 'vitest';
import {
  AMOUNT_TOKEN,
  excelSerialToISO,
  isBillPayment,
  parseAmount,
  parseDate,
  signedStatementPaise,
  suggestExpenseName,
} from './parseHelpers';

describe('parseDate', () => {
  it.each([
    ['16/09/2026', '2026-09-16'],
    ['16-09-2026', '2026-09-16'],
    ['16.09.26', '2026-09-16'],
    ['2026-09-16', '2026-09-16'],
    ['16 Sep 2026', '2026-09-16'],
    ['16-Sep-26', '2026-09-16'],
    ['16 September 2026', '2026-09-16'],
    ['September 16, 2026', '2026-09-16'],
    ['Sep 16, 2026', '2026-09-16'],
  ])('parses %s', (input, iso) => {
    expect(parseDate(input)).toBe(iso);
  });

  it('assumes day first unless told otherwise', () => {
    expect(parseDate('03/04/2026')).toBe('2026-04-03');
    expect(parseDate('03/04/2026', { monthFirst: true })).toBe('2026-03-04');
  });

  it.each(['31/02/2026', '10000000001', 'TRAVEL', '', '1,792.16'])('rejects %j', (input) => {
    expect(parseDate(input)).toBeNull();
  });

  it('accepts Date objects and Excel serials', () => {
    expect(parseDate(new Date(2026, 8, 16))).toBe('2026-09-16');
    expect(excelSerialToISO(46281)).toBe('2026-09-16');
  });
});

describe('parseAmount', () => {
  it.each([
    ['1,792.16 Dr', 179216, 179216],
    ['11,882.46 Cr', 1188246, -1188246],
    ['8,454.25 CR', 845425, -845425],
    ['`8,281.08', 828108, 828108],
    ['₹ 1,23,456.78', 12345678, 12345678],
    ['(250.00)', 25000, -25000],
    ['-250', 25000, -25000],
    ['250.00-', 25000, -25000],
    ['Rs. 99', 9900, 9900],
    ['285.99', 28599, 28599],
    ['11,132.01 C', 1113201, -1113201],
    ['500.00 D', 50000, 50000],
    ['564.32 M', 56432, 56432],
  ])('parses %j', (input, paise, signed) => {
    const parsed = parseAmount(input);
    expect(parsed.paise).toBe(paise);
    expect(signedStatementPaise(parsed)).toBe(signed);
  });

  it('rounds spreadsheet numbers to the paisa', () => {
    expect(parseAmount(1792.1599999).paise).toBe(179216);
    expect(signedStatementPaise(parseAmount(-50))).toBe(-5000);
  });

  it.each(['', 'abc', '1.234', '12/09/2026'])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('recognises amount tokens but not reference numbers', () => {
    expect(AMOUNT_TOKEN.test('1,792.16 Dr')).toBe(true);
    expect(AMOUNT_TOKEN.test('8,454.25 CR')).toBe(true);
    expect(AMOUNT_TOKEN.test('10000000001')).toBe(false);
  });
});

describe('isBillPayment', () => {
  it.each([
    'BBPS PAYMENT RECEIVED - BD000000TESTREF0001',
    'BBPS Payment received',
    'PAYMENT RECEIVED - NEFT',
    'Thank you for your payment',
    'AUTOPAY THANK YOU',
    'IMPS PAYMENT',
  ])('detects %j', (d) => expect(isBillPayment(d)).toBe(true));

  it.each(['CASHBACK CREDIT SEP26', 'AMAZON REFUND', 'AIRTEL PAYMENTS BANK LTD,GURGAON', 'Flipkart Payments'])(
    'ignores %j',
    (d) => expect(isBillPayment(d)).toBe(false),
  );
});

describe('suggestExpenseName', () => {
  it.each([
    ['MAKEMYTRIP INDIA PVT,NEW DELHI', 'Makemytrip'],
    ['LIVPURE,NEW DELHI', 'Livpure'],
    ['NYKAA E RETAIL LIMI,BANGALORE', 'Nykaa E Retail'],
    ['AVENUE SUPERMARTS LTD,GURUGRAM', 'Avenue Supermarts'],
    ['ETERNAL LIMITED,GURGAON', 'Eternal'],
    ['AIRTEL PAYMENTS BANK LTD,GURGAON', 'Airtel Payments Bank'],
    ['CASHBACK CREDIT SEP26-UTILITY:164~OTHERS:101', 'Cashback Credit'],
    ['BBPS PAYMENT RECEIVED - BD000000TESTREF0001', 'BBPS Payment Received'],
    ['Interest Amount Amortization - <19/24>APPLE INDIA PRIVATE LI', 'Apple EMI 19/24 interest'],
    ['Principal Amount Amortization - <6/9>Flipkart Payments', 'Flipkart Payments EMI 6/9'],
    ['Principal Amount Amortization - <6/9>AMAZON PAY INDIA PVT LT', 'Amazon Pay EMI 6/9'],
    ['IGST-CI@18%', 'IGST-CI@18%'],
    ['PPSL*MYNTRA DESIGNS PR Karnataka IND (Pay in EMIs)', 'Myntra Designs'],
    ['ANNUAL FEE CHARGED (EXCL TAX 90.00)', 'Annual Fee Charged'],
    ['FP EMI 11/12(EXCL TAX 2.57)', 'FP EMI 11/12'],
    ['CGST DB @ 09.00%', 'CGST DB @ 09.00%'],
    ['UPI_BLINKIT IND - Ref No: RT262700382000940000425', 'Blinkit'],
    ['EMI PRIN FOR UPI_LENSKART (003/003) - Ref No: 20260000000000000000001', 'EMI Prin For Lenskart (003/003)'],
    ['MAKEMYTRIP INDIA PVT L 356 - Ref No: RT260000000000000000002', 'Makemytrip'],
  ])('%j -> %j', (input, expected) => {
    expect(suggestExpenseName(input)).toBe(expected);
  });
});
