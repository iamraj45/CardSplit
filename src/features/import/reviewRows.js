// Turns parsed statement lines into editable review rows, with duplicate detection.

import { TXN_KIND } from '../../services/import/statementParser';
import { suggestExpenseName } from '../../services/import/parseHelpers';
import { paiseToInput, rupeesToPaise } from '../../utils/currency';
import { isValidISODate } from '../../utils/dates';

export const DUPLICATE = {
  EXISTING: 'existing', // same date and amount as a transaction already on the card
  IN_FILE: 'in_file', // same date, amount and description as an earlier line in this file
};

/**
 * Build review rows. Bill payments and likely duplicates of existing transactions start excluded;
 * everything stays editable so the user has the final say.
 */
export function buildReviewRows(parsed, existingCardTransactions = []) {
  const existing = new Set(existingCardTransactions.map((t) => `${t.date}|${t.amountPaise}`));
  const seen = new Set();
  return parsed.map((t, i) => {
    const fileKey = `${t.date}|${t.amountPaise}|${t.description.toLowerCase()}`;
    const duplicate = existing.has(`${t.date}|${t.amountPaise}`)
      ? DUPLICATE.EXISTING
      : seen.has(fileKey)
        ? DUPLICATE.IN_FILE
        : null;
    seen.add(fileKey);
    return {
      key: i,
      include: t.kind !== TXN_KIND.PAYMENT && duplicate !== DUPLICATE.EXISTING,
      date: t.date,
      expenseName: suggestExpenseName(t.description) || t.description,
      description: t.description,
      amountInput: paiseToInput(t.amountPaise),
      kind: t.kind,
      duplicate,
    };
  });
}

/** Validate one row; returns { amountPaise, errors: string[] }. */
export function checkRow(row) {
  const amountPaise = rupeesToPaise(row.amountInput);
  const errors = [];
  if (!isValidISODate(row.date)) errors.push('Invalid date');
  if (!row.expenseName.trim()) errors.push('Expense name required');
  if (amountPaise == null) errors.push('Invalid amount');
  else if (amountPaise === 0) errors.push('Amount is zero');
  return { amountPaise, errors };
}
