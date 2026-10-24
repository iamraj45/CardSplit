import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TXN_KIND, parseStatement } from './statementParser';
import { extractPositionedText } from './pdfText';

// Synthetic positioned items, modelled on real Axis/ICICI layouts (no personal data).
const item = (str, x, y, w = str.length * 4, h = 7) => ({ str, x, y, w, h });

describe('parseStatement (synthetic layouts)', () => {
  it('separates amount from cashback and description from category (Axis-like)', () => {
    const pages = [
      {
        items: [
          item('Statement Period', 272, 856),
          item('17/09/2026 - 15/10/2026', 260, 844, 90),
          item('Total Payment Due', 52, 856, 66),
          item('1,770.00', 60, 844, 34),
          item('Dr', 98, 844, 9),
          item('DATE', 48, 760, 18),
          item('TRANSACTION DETAILS', 173, 760, 80),
          item('MERCHANT CATEGORY', 346, 760, 72),
          item('AMOUNT (Rs.)', 451, 760, 48),
          item('CASHBACK EARNED', 522, 760, 64),
          item('Card No: 470011******1111', 36, 750, 120),
          item('16/09/2026', 34, 738, 40),
          item('SOME SHOP PVT,NEW DELHI', 89, 738, 120),
          item('TRAVEL', 339, 738, 28),
          item('1,800.00 Dr', 477, 738, 40),
          item('27.00 Cr', 556, 738, 28),
          item('30/09/2026', 34, 727, 40),
          item('BBPS PAYMENT RECEIVED - ABC123DEF456', 89, 727, 160),
          item('500.00 Cr', 480, 727, 34),
          item('0.00 Dr', 559, 727, 26),
          item('11/10/2026', 34, 716, 40),
          item('CASHBACK CREDIT SEP26', 89, 716, 90),
          item('30.00 Cr', 484, 716, 30),
          item('0.00 Dr', 559, 716, 26),
        ],
      },
    ];
    const { transactions, meta } = parseStatement(pages);
    expect(meta).toMatchObject({ last4: '1111', periodStart: '2026-09-17', periodEnd: '2026-10-15', totalDuePaise: 177000 });
    expect(transactions).toEqual([
      { date: '2026-09-16', description: 'SOME SHOP PVT,NEW DELHI', amountPaise: 180000, kind: TXN_KIND.CHARGE },
      { date: '2026-09-30', description: 'BBPS PAYMENT RECEIVED - ABC123DEF456', amountPaise: -50000, kind: TXN_KIND.PAYMENT },
      { date: '2026-10-11', description: 'CASHBACK CREDIT SEP26', amountPaise: -3000, kind: TXN_KIND.CREDIT },
    ]);
  });

  it('joins wrapped descriptions and ignores side-panel text and reward points (ICICI-like)', () => {
    const pages = [
      {
        items: [
          item('Statement period : September 16, 2026 to October 15, 2026', 40, 51, 200),
          item('Date', 208, 466, 16),
          item('SerNo.', 262, 466, 24),
          item('Transaction Details', 305, 466, 70),
          item('Reward', 443, 466, 26),
          item('Intl.', 486, 466, 12),
          item('#', 498, 466, 4),
          item('Amount (in', 522, 466, 30),
          item('`', 552, 466, 3),
          item(')', 555, 466, 3),
          item('4315XXXXXXXX2222', 208, 444, 70),
          item('59%', 92, 432, 14),
          item('18/09/2026', 208, 432, 40),
          item('10000000001', 252, 432, 44),
          item('Interest Amount Amortization -', 305, 432, 110),
          item('0', 452, 432, 4),
          item('285.99', 538, 432, 22),
          item('<19/24>SHOP NAME PRIVATE LI', 305, 423, 110),
          item('30/09/2026', 208, 410, 40),
          item('10000000002', 252, 410, 44),
          item('BBPS Payment received', 305, 410, 80),
          item('0', 452, 410, 4),
          item('1,000.00 CR', 524, 410, 36),
          item('Apparel/Grocery-41%', 52, 400, 70),
          item('05/10/2026', 208, 397, 40),
          item('10000000003', 252, 397, 44),
          item('IGST-CI@18%', 305, 397, 44),
          item('0', 452, 397, 4),
          item('9.73', 545, 397, 15),
          item('#', 205, 380, 4),
          item('International Spends', 209, 380, 70),
        ],
      },
      {
        // An EMI schedule on a later page must not be mistaken for transactions.
        items: [item('18/03/2025', 208, 700, 40), item('Merchant EMI', 305, 700, 50), item('76,510.00', 530, 700, 34)],
      },
    ];
    const { transactions, meta } = parseStatement(pages);
    expect(meta.last4).toBe('2222');
    expect(meta.periodStart).toBe('2026-09-16');
    expect(transactions).toEqual([
      {
        date: '2026-09-18',
        description: 'Interest Amount Amortization - <19/24>SHOP NAME PRIVATE LI',
        amountPaise: 28599,
        kind: TXN_KIND.CHARGE,
      },
      { date: '2026-09-30', description: 'BBPS Payment received', amountPaise: -100000, kind: TXN_KIND.PAYMENT },
      { date: '2026-10-05', description: 'IGST-CI@18%', amountPaise: 973, kind: TXN_KIND.CHARGE },
    ]);
  });

  it('handles single-letter C/D/M markers, tax notes and rows without their own date (SBI-like)', () => {
    const pages = [
      {
        items: [
          item('Date', 35, 568, 18),
          item('Transaction Details', 179, 568, 70),
          item('Amount', 371, 568, 28),
          item('( ` )', 401, 568, 14),
          item('for Statement Period: 07 Sep 26 to 06 Oct 26', 157, 560, 180),
          item('25 Sep 26', 26, 540, 34),
          item('PAYMENT RECEIVED 000BD000000TESTREF02', 71, 540, 160),
          item('11,132.01', 369, 540, 34),
          item('C', 415, 540, 5),
          item('06 Oct 26', 26, 529, 34),
          item('ANNUAL FEE CHARGED', 71, 529, 80),
          item('(EXCL TAX', 161, 529, 36),
          item('90.00)', 203, 529, 22),
          item('500.00', 381, 529, 22),
          item('D', 415, 529, 5),
          item('06 Oct 26', 26, 517, 34),
          item('FP EMI 11/12(EXCL TAX', 71, 517, 86),
          item('2.57)', 162, 517, 18),
          item('564.32', 381, 517, 22),
          item('M', 414, 517, 6),
          item('CGST DB @ 09.00%', 71, 505, 64),
          item('72.93', 385, 505, 18),
          item('D', 415, 505, 5),
          item('TRANSACTIONS FOR CARD HOLDER', 71, 493, 120),
          item('17 Sep 26', 26, 481, 34),
          item('SHOP REFUND', 71, 481, 50),
          item('932.00', 381, 481, 22),
          item('C', 415, 481, 5),
        ],
      },
    ];
    const { transactions, meta } = parseStatement(pages);
    expect(meta.periodStart).toBe('2026-09-07');
    expect(transactions.map((t) => [t.date, t.description, t.amountPaise, t.kind])).toEqual([
      ['2026-09-25', 'PAYMENT RECEIVED 000BD000000TESTREF02', -1113201, TXN_KIND.PAYMENT],
      ['2026-10-06', 'ANNUAL FEE CHARGED (EXCL TAX 90.00)', 50000, TXN_KIND.CHARGE],
      ['2026-10-06', 'FP EMI 11/12(EXCL TAX 2.57)', 56432, TXN_KIND.CHARGE],
      ['2026-10-06', 'CGST DB @ 09.00%', 7293, TXN_KIND.CHARGE], // takes the date of the row above
      ['2026-09-17', 'SHOP REFUND', -93200, TXN_KIND.CREDIT], // section heading not glued to any row
    ]);
  });

  it('joins description lines above and below a vertically centred row (Yes Bank-like)', () => {
    const pages = [
      {
        items: [
          item('Statement Period: 15/09/2026 To 14/10/2026', 102, 569, 160),
          item('Date', 48, 188, 16),
          item('Transaction Details', 93, 188, 70),
          item('Merchant Category', 377, 188, 70),
          item('Amount (Rs.)', 491, 188, 46),
          item('14/09/2026', 48, 167, 38),
          item('UPI_SHOP IND - Ref No: RT1', 93, 167, 120),
          item('Business Services', 377, 167, 64),
          item('229.00 Dr', 512, 167, 34),
          item('UPI CR ADJ 600000000001 - Ref No:', 93, 150, 140),
          item('15/09/2026', 48, 145, 38),
          item('Business Services', 377, 145, 64),
          item('229.00 Cr', 512, 145, 34),
          item('00000000000000000000003', 93, 141, 100),
          item('16/09/2026', 48, 124, 38),
          item('MAKEMYTRIP - Ref No: RT2', 93, 124, 100),
          item('6,090.00 Dr', 505, 124, 40),
        ],
      },
    ];
    const { transactions } = parseStatement(pages);
    expect(transactions.map((t) => [t.date, t.description, t.amountPaise])).toEqual([
      ['2026-09-14', 'UPI_SHOP IND - Ref No: RT1', 22900],
      ['2026-09-15', 'UPI CR ADJ 600000000001 - Ref No: 00000000000000000000003', -22900],
      ['2026-09-16', 'MAKEMYTRIP - Ref No: RT2', 609000],
    ]);
  });

  it('reads dates with times, a "C" rupee glyph and "+" credits (HDFC-like)', () => {
    const pages = [
      {
        items: [
          item('Billing Period', 192, 700, 37),
          item('24 Sep, 2026 - 23 Oct, 2026', 298, 700, 79),
          item('TOTAL AMOUNT DUE', 446, 615, 62),
          item('C', 168, 592, 4),
          item('17,935.73', 172, 592, 33),
          item('=', 424, 592, 5),
          item('C', 446, 592, 7),
          item('18,824.00', 453, 592, 61),
          item('DATE & TIME', 170, 226, 38),
          item('TRANSACTION DESCRIPTION', 260, 226, 83),
          item('AMOUNT', 528, 226, 28),
          item('PI', 567, 226, 6),
          item('23/09/2026| 13:24', 170, 196, 55),
          item('SwiggyBENGALURU', 260, 196, 56),
          item('C', 532, 196, 3),
          item('629.00', 537, 196, 20),
          item('l', 567, 196, 5),
          item('25/09/2026| 00:00', 170, 182, 55),
          item('10% Swiggy CashBack', 260, 182, 62),
          item('+', 529, 182, 3),
          item('C', 535, 182, 3),
          item('62.90', 540, 182, 16),
          item('05/10/2026| 22:43', 170, 168, 55),
          item('BPPY PYMT BD0000000000 (Ref# 000000000000001)', 260, 168, 185),
          item('+', 510, 168, 3),
          item('C', 516, 168, 3),
          item('14,590.00', 521, 168, 28),
        ],
      },
    ];
    const { transactions, meta } = parseStatement(pages);
    expect(meta).toMatchObject({ periodStart: '2026-09-24', periodEnd: '2026-10-23', totalDuePaise: 1882400 });
    expect(transactions.map((t) => [t.date, t.description, t.amountPaise, t.kind])).toEqual([
      ['2026-09-23', 'SwiggyBENGALURU', 62900, TXN_KIND.CHARGE],
      ['2026-09-25', '10% Swiggy CashBack', -6290, TXN_KIND.CREDIT],
      ['2026-10-05', 'BPPY PYMT BD0000000000 (Ref# 000000000000001)', -1459000, TXN_KIND.PAYMENT],
    ]);
  });

  it('falls back to date + amount when there is no header', () => {
    const pages = [
      {
        items: [
          item('05/10/2026', 30, 500, 40),
          item('Coffee House', 80, 500, 50),
          item('250.00', 300, 500, 24),
          item('12/10/2026 Refund from shop', 30, 488, 110),
          item('100.00 CR', 300, 488, 34),
        ],
      },
    ];
    const { transactions } = parseStatement(pages);
    expect(transactions.map((t) => [t.date, t.description, t.amountPaise, t.kind])).toEqual([
      ['2026-10-05', 'Coffee House', 25000, TXN_KIND.CHARGE],
      ['2026-10-12', 'Refund from shop', -10000, TXN_KIND.CREDIT],
    ]);
  });
});

// The real sample statements live in samples/ (not part of the app). Skip when absent.
const SAMPLES = 'samples';
const axisPath = `${SAMPLES}/Axis bank sample statement.pdf`;
const iciciPath = `${SAMPLES}/ICICI bank sample statement.pdf`;
const sbiPath = `${SAMPLES}/SBI bank sample statement.pdf`;
const yesPath = `${SAMPLES}/Yes Bank sample statement.pdf`;
const hdfcPath = `${SAMPLES}/HDFC bank sample statement.pdf`;

async function parseFile(path) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, verbosity: 0 }).promise;
  return parseStatement(await extractPositionedText(doc));
}

const sum = (txns) => txns.reduce((s, t) => s + t.amountPaise, 0);

describe.skipIf(!existsSync(axisPath))('Axis sample statement', () => {
  it('extracts all transactions and matches the total due', async () => {
    const { transactions, meta } = await parseFile(axisPath);
    expect(meta).toMatchObject({
      cardName: 'Axis Bank ACE Credit Card',
      last4: expect.stringMatching(/^\d{4}$/),
      periodStart: '2026-09-17',
      periodEnd: '2026-10-15',
      totalDuePaise: 1152521,
    });
    expect(transactions).toHaveLength(11);
    const payments = transactions.filter((t) => t.kind === TXN_KIND.PAYMENT);
    expect(payments.map((t) => t.amountPaise)).toEqual([-1188246]);
    expect(transactions.filter((t) => t.kind === TXN_KIND.CREDIT).map((t) => t.amountPaise)).toEqual([-26500]);
    expect(sum(transactions.filter((t) => t.kind !== TXN_KIND.PAYMENT))).toBe(meta.totalDuePaise);
    expect(transactions[0]).toMatchObject({ date: '2026-09-16', description: 'MAKEMYTRIP INDIA PVT,NEW DELHI', amountPaise: 179216 });
  });
});

describe.skipIf(!existsSync(iciciPath))('ICICI sample statement', () => {
  it('extracts all transactions, joins wrapped lines and matches the total due', async () => {
    const { transactions, meta } = await parseFile(iciciPath);
    expect(meta).toMatchObject({
      cardName: 'ICICI Bank Credit Card',
      last4: expect.stringMatching(/^\d{4}$/),
      periodStart: '2026-09-16',
      periodEnd: '2026-10-15',
      totalDuePaise: 828108,
    });
    expect(transactions).toHaveLength(10);
    expect(transactions[0].description).toBe('Interest Amount Amortization - <19/24>APPLE INDIA PRIVATE LI');
    expect(transactions.filter((t) => t.kind === TXN_KIND.PAYMENT).map((t) => t.amountPaise)).toEqual([-845425]);
    expect(sum(transactions.filter((t) => t.kind !== TXN_KIND.PAYMENT))).toBe(meta.totalDuePaise);
  });
});

describe.skipIf(!existsSync(sbiPath))('SBI Card sample statement', () => {
  it('extracts every row, including C/D/M-marked and dateless GST rows', async () => {
    const { transactions, meta } = await parseFile(sbiPath);
    expect(meta).toMatchObject({
      cardName: 'SBI Card',
      last4: null, // SBI only prints the last two digits
      periodStart: '2026-09-07',
      periodEnd: '2026-10-06',
      totalDuePaise: 1281500,
    });
    expect(transactions.map((t) => [t.date, t.amountPaise, t.kind])).toEqual([
      ['2026-09-25', -1113201, TXN_KIND.PAYMENT],
      ['2026-10-06', 50000, TXN_KIND.CHARGE],
      ['2026-10-06', 56432, TXN_KIND.CHARGE],
      ['2026-10-06', 1430, TXN_KIND.CHARGE],
      ['2026-10-06', 1049315, TXN_KIND.CHARGE],
      ['2026-10-06', 29599, TXN_KIND.CHARGE],
      ['2026-10-06', 7293, TXN_KIND.CHARGE],
      ['2026-10-06', 7293, TXN_KIND.CHARGE],
      ['2026-09-13', 265800, TXN_KIND.CHARGE],
      ['2026-09-17', -93200, TXN_KIND.CREDIT],
      ['2026-09-19', -61400, TXN_KIND.CREDIT],
    ]);
    // Every line on the statement is imported. The sum differs from the total due by the
    // EMI interest, which SBI shows both inside the "M" instalment lines and as separate lines.
    expect(sum(transactions.filter((t) => t.kind !== TXN_KIND.PAYMENT))).toBe(1312562);
  });
});

describe.skipIf(!existsSync(yesPath))('Yes Bank sample statement', () => {
  it('extracts every row and joins descriptions wrapped around the row', async () => {
    const { transactions, meta } = await parseFile(yesPath);
    expect(meta).toMatchObject({
      cardName: 'YES Bank Credit Card',
      last4: expect.stringMatching(/^\d{4}$/),
      periodStart: '2026-09-15',
      periodEnd: '2026-10-14',
      totalDuePaise: 730865,
    });
    expect(transactions).toHaveLength(17);
    expect(transactions[1]).toMatchObject({
      date: '2026-09-15',
      description: expect.stringMatching(/^UPI CR ADJ \d+ AUTH \w+ - Ref No: \d+$/), // first line + wrapped line
      amountPaise: -22900,
      kind: TXN_KIND.CREDIT,
    });
    expect(transactions.filter((t) => t.kind === TXN_KIND.PAYMENT).map((t) => t.amountPaise)).toEqual([-438610]);
    expect(transactions.at(-1)).toMatchObject({ description: 'GOODS & SERVICES TAX - GST @ 18%', amountPaise: 5683 });
    expect(sum(transactions.filter((t) => t.kind !== TXN_KIND.PAYMENT))).toBe(707965);
  });
});

describe.skipIf(!existsSync(hdfcPath))('HDFC sample statement', () => {
  it('extracts every row across pages, with times, "C" rupee glyphs and "+" credits', async () => {
    const { transactions, meta } = await parseFile(hdfcPath);
    expect(meta).toMatchObject({
      cardName: 'Swiggy HDFC Bank Credit Card',
      last4: expect.stringMatching(/^\d{4}$/),
      periodStart: '2026-09-24',
      periodEnd: '2026-10-23',
      totalDuePaise: 1882400,
    });
    expect(transactions).toHaveLength(65);
    expect(transactions[0]).toMatchObject({ date: '2026-09-23', description: 'SwiggyBENGALURU', amountPaise: 62900, kind: TXN_KIND.CHARGE });
    expect(transactions.filter((t) => t.kind === TXN_KIND.PAYMENT).map((t) => t.amountPaise)).toEqual([-1459000]);
    expect(transactions.at(-1)).toMatchObject({ date: '2026-10-23', amountPaise: 10400, kind: TXN_KIND.CHARGE });
    // Total due 18,824 = 18,823.15 of new items + 0.41 left from the previous bill, rounded up by HDFC.
    expect(sum(transactions.filter((t) => t.kind !== TXN_KIND.PAYMENT))).toBe(1882315);
  });
});
