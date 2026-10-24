// Dates are stored as ISO "YYYY-MM-DD" strings to avoid timezone drift.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function todayISO() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function isValidISODate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "2026-03-15" -> "15 Mar 2026" */
export function formatDate(iso) {
  if (!isValidISODate(iso)) return iso ?? '';
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** Period label, e.g. "March – April 2026" or "December 2025 – January 2026". */
export function formatPeriod(startISO, endISO) {
  if (!isValidISODate(startISO) || !isValidISODate(endISO)) return '';
  const s = parts(startISO);
  const e = parts(endISO);
  if (s.y === e.y && s.m === e.m) return `${MONTHS[s.m - 1]} ${s.y}`;
  if (s.y === e.y) return `${MONTHS[s.m - 1]} – ${MONTHS[e.m - 1]} ${e.y}`;
  return `${MONTHS[s.m - 1]} ${s.y} – ${MONTHS[e.m - 1]} ${e.y}`;
}

/** Inclusive overlap check for two ISO date ranges. */
export function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}
