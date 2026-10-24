import { RECONCILIATION_STATUS } from '../../features/model';
import { CARD_STATUS, cardStatus, unassignedItems } from './totals';

/**
 * Overall status derived from saved data. A reconciliation is reconciled only when every
 * card matches its statement and every transaction and adjustment is fully assigned.
 */
export function deriveStatus(rec) {
  if (rec.cards.length === 0) return RECONCILIATION_STATUS.DRAFT;
  const allMatched = rec.cards.every((card) => cardStatus(rec, card) === CARD_STATUS.MATCHED);
  const allAssigned =
    unassignedItems(rec, rec.transactions).length === 0 && unassignedItems(rec, rec.adjustments).length === 0;
  return allMatched && allAssigned ? RECONCILIATION_STATUS.RECONCILED : RECONCILIATION_STATUS.NEEDS_REVIEW;
}

export const STATUS_LABELS = {
  [RECONCILIATION_STATUS.DRAFT]: { label: 'Draft', color: 'default' },
  [RECONCILIATION_STATUS.NEEDS_REVIEW]: { label: 'Needs review', color: 'warning' },
  [RECONCILIATION_STATUS.RECONCILED]: { label: 'Reconciled', color: 'success' },
};
