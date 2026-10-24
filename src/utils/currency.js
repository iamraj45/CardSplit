// All money in the app is stored as integer paise (1 rupee = 100 paise).

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Parse a user-entered rupee amount into integer paise.
 * Accepts optional leading minus, optional ₹, Indian/Western comma grouping,
 * and at most two decimal places. Returns null when the input is invalid.
 */
export function rupeesToPaise(input) {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return null;

  const cleaned = input.trim().replace(/₹/g, '').replace(/,/g, '').replace(/\s+/g, '');
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, minus, whole, fraction = ''] = match;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) return null;
  return minus && paise !== 0 ? -paise : paise;
}

/** Convert paise to a plain editable string, e.g. 123450 -> "1234.50". */
export function paiseToInput(paise) {
  if (paise == null) return '';
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const inrWholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format paise as Indian rupees, e.g. 662300 -> "₹6,623.00".
 * With { compact: true }, whole-rupee amounts drop the ".00" ("₹6,623") but paise are never rounded away.
 */
export function formatINR(paise, { compact = false } = {}) {
  const value = paise ?? 0;
  if (compact && value % 100 === 0) return inrWholeFormatter.format(value / 100);
  return inrFormatter.format(value / 100);
}
