// Column mapping and conversion for spreadsheet-like statements (CSV and Excel).
// Rows are arrays of cells (strings, numbers or Date objects).

import { excelSerialToISO, isBillPayment, parseAmount, parseDate, signedStatementPaise } from './parseHelpers';
import { TXN_KIND } from './statementParser';

export const MAPPING_ROLES = ['date', 'description', 'amount', 'debit', 'credit', 'drcr'];

const HEADER_GUESSES = {
  date: /^(txn\.?\s*|transaction\s*|posting\s*|tran\.?\s*)?date\b/i,
  description: /(description|details|particulars|narration|merchant|remarks|transaction$)/i,
  amount: /^(?!.*(intl|international|foreign|cashback|reward|balance)).*amount/i,
  debit: /^(debit|withdrawal|dr\.?)( amount)?\b/i,
  credit: /^(credit|deposit|cr\.?)( amount)?\b(?!\s*card)/i,
  drcr: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|debit\s*\/\s*credit|type|txn type|transaction type)$/i,
};

const cellText = (cell) => (cell == null ? '' : cell instanceof Date ? cell.toISOString() : String(cell)).trim();

/** Guess which column holds which role from a header row. Returns { role: columnIndex | null }. */
export function guessMapping(headerCells) {
  const mapping = Object.fromEntries(MAPPING_ROLES.map((r) => [r, null]));
  const used = new Set();
  // drcr and debit/credit before amount so "Debit Amount" isn't taken as the generic amount column.
  for (const role of ['date', 'drcr', 'debit', 'credit', 'amount', 'description']) {
    const index = headerCells.findIndex((cell, i) => !used.has(i) && HEADER_GUESSES[role].test(cellText(cell)));
    if (index !== -1) {
      mapping[role] = index;
      used.add(index);
    }
  }
  return mapping;
}

/** Index of the first row (within the first 30) that looks like a header. */
export function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const m = guessMapping(rows[i]);
    if (m.date != null && (m.amount != null || m.debit != null || m.credit != null)) return i;
  }
  return 0;
}

export const headerSignature = (cells) => cells.map((c) => cellText(c).toLowerCase()).join('|');

export function mappingIsUsable(mapping) {
  return mapping.date != null && (mapping.amount != null || mapping.debit != null || mapping.credit != null);
}

function cellDate(cell, monthFirst) {
  if (cell instanceof Date) return parseDate(cell);
  if (typeof cell === 'number') return excelSerialToISO(cell);
  // Strip a trailing time ("16/09/2026 14:32:10") before parsing.
  return parseDate(cellText(cell).replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AaPp][Mm])?$/, ''), { monthFirst });
}

function cellPaise(cell) {
  const parsed = parseAmount(typeof cell === 'number' ? cell : cellText(cell));
  return parsed;
}

/**
 * Convert data rows into transactions using a column mapping.
 * Options: monthFirst (MM/DD dates), invertSigns (file uses negative numbers for spends).
 * Rows without a valid date or amount (totals, blank lines, footers) are skipped and counted.
 */
export function rowsToTransactions(rows, headerIndex, mapping, { monthFirst = false, invertSigns = false } = {}) {
  const transactions = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row || row.every((c) => cellText(c) === '')) continue;
    const date = mapping.date != null ? cellDate(row[mapping.date], monthFirst) : null;

    let amountPaise = null;
    if (mapping.amount != null) {
      const parsed = cellPaise(row[mapping.amount]);
      if (parsed) {
        amountPaise = signedStatementPaise(parsed);
        const type = mapping.drcr != null ? cellText(row[mapping.drcr]).toLowerCase() : '';
        if (/^(cr|credit|c)\b/.test(type)) amountPaise = -Math.abs(amountPaise);
        else if (/^(dr|debit|d)\b/.test(type)) amountPaise = Math.abs(amountPaise);
        if (invertSigns) amountPaise = -amountPaise;
      }
    } else {
      const debit = mapping.debit != null ? cellPaise(row[mapping.debit]) : null;
      const credit = mapping.credit != null ? cellPaise(row[mapping.credit]) : null;
      if (debit?.paise) amountPaise = debit.paise;
      else if (credit?.paise) amountPaise = -credit.paise;
    }

    if (!date || amountPaise == null || amountPaise === 0) {
      skipped++;
      continue;
    }
    const description = mapping.description != null ? cellText(row[mapping.description]).replace(/\s+/g, ' ') : '';
    const kind =
      amountPaise > 0 ? TXN_KIND.CHARGE : isBillPayment(description) ? TXN_KIND.PAYMENT : TXN_KIND.CREDIT;
    transactions.push({ date, description, amountPaise, kind });
  }
  return { transactions, skipped };
}
