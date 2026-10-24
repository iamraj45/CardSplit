// Converts between a stored split and the editable form state used by SplitEditor.
// Draft: { method: null | SPLIT_METHODS.*, personIds: string[], inputs: { [personId]: string } }
//   personIds -> selection for single/equal; inputs -> typed values for percentage/custom.

import { SPLIT_METHODS, allocate, percentToBasisPoints } from '../../services/calculations/splitCalculations';
import { paiseToInput, rupeesToPaise } from '../../utils/currency';

const usesInputs = (method) => method === SPLIT_METHODS.PERCENTAGE || method === SPLIT_METHODS.CUSTOM;

export const emptyDraft = () => ({ method: null, personIds: [], inputs: {} });

export function draftFromSplit(split) {
  if (!split?.method) return emptyDraft();
  const inputs = {};
  if (usesInputs(split.method)) {
    for (const a of split.allocations) {
      const text = paiseToInput(a.value);
      inputs[a.personId] = split.method === SPLIT_METHODS.PERCENTAGE ? text.replace(/\.00$/, '') : text;
    }
  }
  return { method: split.method, personIds: split.allocations.map((a) => a.personId), inputs };
}

/** A previous split worth pre-filling for the next entry (custom amounts depend on the amount, so they are not reused). */
export function reusableSplit(split) {
  return split && split.method !== SPLIT_METHODS.CUSTOM ? split : null;
}

/**
 * Turn a draft into a stored split and validate it against the amount.
 * Returns { split, result, error }; split is null when the item is left unassigned.
 */
export function splitFromDraft(draft, amountPaise, people) {
  if (!draft.method) return { split: null, result: null, error: null };

  let allocations;
  if (usesInputs(draft.method)) {
    const isPercent = draft.method === SPLIT_METHODS.PERCENTAGE;
    const rows = people.filter((p) => (draft.inputs[p.id] ?? '').trim() !== '');
    allocations = [];
    for (const p of rows) {
      const value = isPercent ? percentToBasisPoints(draft.inputs[p.id]) : rupeesToPaise(draft.inputs[p.id]);
      if (value == null) {
        return { split: null, result: null, error: `Enter a valid ${isPercent ? 'percentage' : 'amount'} for ${p.name}` };
      }
      allocations.push({ personId: p.id, value });
    }
  } else {
    const known = new Set(people.map((p) => p.id));
    allocations = draft.personIds.filter((id) => known.has(id)).map((personId) => ({ personId, value: null }));
  }

  const split = { method: draft.method, allocations };
  if (amountPaise == null) return { split, result: null, error: null };
  const result = allocate(amountPaise, split);
  return { split, result, error: result.ok ? null : result.error };
}
