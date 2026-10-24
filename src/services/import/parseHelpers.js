// Parsing helpers shared by the CSV, Excel and PDF importers.
// Dates follow Indian conventions (day before month) unless told otherwise.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function toISO(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const monthIndex = (name) => {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
};

/** Regex source matching one date in any supported format (used to find periods in free text). */
export const DATE_PATTERN =
  '(?:\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[ -](?:[A-Za-z]{3,9})[\\s,-]*\\d{2,4}|[A-Za-z]{3,9}\\.? \\d{1,2},? \\d{4})';

/**
 * Parse a date string (or Date object) into ISO "YYYY-MM-DD".
 * Supports 16/09/2026, 16-09-26, 2026-09-16, 16 Sep 2026, 16-Sep-26, September 16, 2026.
 */
export function parseDate(value, { monthFirst = false } = {}) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toISO(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/\s+/g, ' ');

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return toISO(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return monthFirst ? toISO(+m[3], +m[1], +m[2]) : toISO(+m[3], +m[2], +m[1]);

  m = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?[\s,-]*(\d{2}|\d{4})$/.exec(s);
  if (m && monthIndex(m[2])) return toISO(+m[3], monthIndex(m[2]), +m[1]);

  m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(s);
  if (m && monthIndex(m[1])) return toISO(+m[3], monthIndex(m[1]), +m[2]);

  return null;
}

/** Excel serial date (days since 1899-12-30) -> ISO. */
export function excelSerialToISO(serial) {
  if (typeof serial !== 'number' || serial < 20000 || serial > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return toISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Text that looks like a statement amount, e.g. "1,792.16 Dr", "8,454.25 CR", "`8,281.08", "(250.00)". */
// Markers after an amount: "Cr"/"Dr", or single letters as used by SBI Card
// (C = credit, D = debit, M = monthly instalment, which is a debit).
export const AMOUNT_TOKEN =
  /^[(+-]?\s*(?:[`₹]|rs\.?|inr)?\s*-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\)?-?(?:\s*(?:cr|dr)\.?|\s+[cdm])?$/i;
export const MARKER_TOKEN = /^(cr|dr|c|d|m)\.?$/i;
const TRAILING_MARKER = /(?:\s*(cr|dr)\.?|\s+([cdm]))$/i;

/**
 * Parse an amount. Returns { paise (always >= 0), negative, marker: 'cr' | 'dr' | null } or null.
 * Numbers (from Excel) are rounded to the nearest paisa.
 */
export function parseAmount(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return { paise: Math.round(Math.abs(value) * 100), negative: value < 0, marker: null };
  }
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;

  let marker = null;
  const markerMatch = TRAILING_MARKER.exec(s);
  if (markerMatch) {
    const letter = (markerMatch[1] ?? markerMatch[2]).toLowerCase();
    marker = letter.startsWith('c') ? 'cr' : letter.startsWith('d') ? 'dr' : null;
    s = s.slice(0, markerMatch.index).trim();
  }

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(?:[`₹]|rs\.?|inr)\s*/i, '').trim();
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/^(?:[`₹]|rs\.?|inr)\s*/i, '').replace(/,/g, '').trim();

  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) return null;
  return { paise, negative, marker };
}

/**
 * Signed paise for a statement line: charges positive, credits/refunds/payments negative.
 * A "Cr" marker or a negative sign means credit.
 */
export function signedStatementPaise(parsed) {
  if (!parsed) return null;
  const credit = parsed.marker === 'cr' ? !parsed.negative : parsed.negative;
  return credit ? -parsed.paise : parsed.paise;
}

const PAYMENT_PATTERN =
  /(payment\s+(received|recd|recieved|thank)|bbps\s+payment|auto\s*pay|autodebit|auto\s+debit|thank\s+you\s+for\s+(your\s+)?payment|(neft|imps|upi|online)\s+payment|payment\s+-?\s*(neft|imps|upi)|^payment\b|cc\s+payment|bill\s*payment\s+received|infinity\s+payment)/i;

/** Whether a credit line is a payment towards the bill (as opposed to a refund or cashback). */
export function isBillPayment(description) {
  return PAYMENT_PATTERN.test(description ?? '');
}

const ACRONYMS = new Set([
  'ICICI', 'HDFC', 'SBI', 'IRCTC', 'UPI', 'EMI', 'GST', 'IGST', 'CGST', 'SGST', 'ATM', 'NEFT', 'IMPS', 'BBPS',
  'LIC', 'BSNL', 'IOCL', 'HPCL', 'BPCL', 'KFC', 'IKEA', 'BMS', 'OLA', 'MRP', 'DTH', 'POS', 'IDFC', 'AU', 'RBL', 'HSBC',
]);

function titleWord(word) {
  if (!/^[A-Z&'.]+$/.test(word)) return word; // mixed case, digits or symbols: leave alone
  if (ACRONYMS.has(word.replace(/[.']/g, ''))) return word;
  if (word.length <= 4 && !/[AEIOU]/.test(word)) return word; // likely an acronym
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/**
 * Turn a raw statement description into a short, readable expense name.
 * The original description is always kept separately, so this only needs to be a good default.
 */
export function suggestExpenseName(description) {
  let s = (description ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // ICICI-style EMI lines: "Interest Amount Amortization - <19/24>APPLE INDIA PRIVATE LI"
  const emi = /^(interest|principal)\s+amount\s+amortization\s*-?\s*<(\d+\/\d+)>\s*(.+)$/i.exec(s);
  if (emi) {
    const merchant = suggestExpenseName(emi[3]);
    return `${merchant} EMI ${emi[2]}${emi[1].toLowerCase() === 'interest' ? ' interest' : ''}`.trim();
  }

  // Payment-gateway prefixes: "PPSL*MYNTRA", "UPI_BLINKIT", "PAYU*SWIGGY"
  const unprefixed = s.replace(GATEWAY_PREFIX, '').replace(/\bupi_/gi, '').trim();
  if (unprefixed) s = unprefixed;

  const beforeDash = s.split(/\s+-\s+/)[0].trim();
  if (beforeDash) s = beforeDash;
  const beforeComma = s.split(',')[0].trim(); // "LIVPURE,NEW DELHI" -> "LIVPURE"
  if (beforeComma) s = beforeComma;
  const noNote = s
    .replace(/\s*\((?:excl|incl)\.?\s+tax[^)]*\)?/gi, '') // SBI "(EXCL TAX 90.00)"
    .replace(/\s*\([^)\d]*\)\s*$/, '') // "(Pay in EMIs)", but keep "(003/003)"
    .trim();
  if (noNote) s = noNote;

  const legal = s.replace(/\s+(private|pvt|ltd|lt|limi\w*|llp|inc)\b.*$/i, '').trim();
  if (legal) s = legal;

  // Trailing location codes and fragments: "MYNTRA DESIGNS PR Karnataka IND" -> "MYNTRA DESIGNS"
  let words = s.split(' ');
  while (words.length > 1 && (LOCATION_WORDS.has(words.at(-1).toLowerCase()) || words.at(-1).length <= 2)) {
    words = words.slice(0, -1);
  }

  // Drop trailing reference-like words ("CASHBACK CREDIT SEP26-UTILITY:164" -> "CASHBACK CREDIT"),
  // keeping instalment numbers ("11/12", "(003/003)") and rates ("09.00%").
  const meaningful = (w) => /^\(?\d+\/\d+\)?$/.test(w) || /^\d+(\.\d+)?%$/.test(w);
  const isCoded = (w) => !meaningful(w) && ((/\d/.test(w) && /[^\d]/.test(w)) || /^\d{6,}$/.test(w));
  const firstCoded = words.findIndex((w, i) => i > 0 && isCoded(w));
  if (firstCoded > 0) words = words.slice(0, firstCoded);

  return words.map(titleWord).join(' ');
}

const GATEWAY_PREFIX = /^(?:ppsl|payu|pyu|raz|rzp|razorpay|cca|ccavenue|bd|bharatpe|phonepe|paytm|ibibo|sq|ezetap)\s*\*\s*|^upi[_\s-]+/i;

const LOCATION_WORDS = new Set([
  'india', 'ind', 'in', 'kar', 'ka', 'mah', 'mh', 'del', 'dl', 'har', 'hr', 'tn', 'ts', 'ap', 'up', 'wb', 'gj', 'rj', 'kl',
  'pb', 'karnataka', 'maharashtra', 'delhi', 'haryana', 'telangana', 'gujarat', 'rajasthan', 'kerala', 'punjab', 'bihar',
  'gurgaon', 'gurugram', 'bangalore', 'bengaluru', 'mumbai', 'noida', 'pune', 'hyderabad', 'chennai', 'kolkata',
]);
