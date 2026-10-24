// Split calculations. All amounts are integer paise; percentages are integer basis points
// (100% = 10000) so every calculation is exact. Rounding is deterministic: the leftover
// paise go to the largest fractional remainders, ties broken by allocation order.
//
// Split shape: { method, allocations: [{ personId, value }] }
//   single     -> one allocation, value null
//   equal      -> one allocation per person, value null
//   percentage -> value = basis points
//   custom     -> value = paise

import { rupeesToPaise } from '../../utils/currency';

export const SPLIT_METHODS = {
  SINGLE: 'single',
  EQUAL: 'equal',
  PERCENTAGE: 'percentage',
  CUSTOM: 'custom',
};

export const FULL_PERCENT_BP = 10000;

/** "33.33" or "33.33%" -> 3333 basis points. Same 2-decimal rules as rupee amounts. */
export function percentToBasisPoints(input) {
  return rupeesToPaise(typeof input === 'string' ? input.replace(/%/g, '') : input);
}

/**
 * Split `amountPaise` in proportion to positive integer `weights`.
 * The result always sums exactly to `amountPaise` and keeps its sign.
 */
export function distribute(amountPaise, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) throw new Error('Weights must sum to a positive number');

  const sign = amountPaise < 0 ? -1 : 1;
  const abs = Math.abs(amountPaise);
  const parts = weights.map((w, i) => ({
    i,
    share: Math.floor((abs * w) / total),
    remainder: (abs * w) % total,
  }));

  let leftover = abs - parts.reduce((s, p) => s + p.share, 0);
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let k = 0; leftover > 0; k++, leftover--) byRemainder[k % byRemainder.length].share += 1;

  return parts.map((p) => (p.share === 0 ? 0 : sign * p.share));
}

const fail = (error) => ({ ok: false, shares: [], error });

/**
 * Compute each person's share of an amount.
 * Returns { ok, shares: [{ personId, paise }], error }.
 * `knownPersonIds` (optional Set) rejects allocations to people no longer in the reconciliation.
 */
export function allocate(amountPaise, split, knownPersonIds) {
  if (!split || !split.method) return fail('Not assigned');
  const allocations = split.allocations ?? [];
  if (allocations.length === 0) return fail('Select at least one person');

  const ids = allocations.map((a) => a.personId);
  if (new Set(ids).size !== ids.length) return fail('A person appears more than once');
  if (knownPersonIds && ids.some((id) => !knownPersonIds.has(id))) return fail('Assigned to a removed person');

  const withShares = (paise) => ({ ok: true, shares: ids.map((personId, i) => ({ personId, paise: paise[i] })), error: null });

  switch (split.method) {
    case SPLIT_METHODS.SINGLE:
      if (allocations.length !== 1) return fail('Select exactly one person');
      return withShares([amountPaise]);

    case SPLIT_METHODS.EQUAL:
      return withShares(distribute(amountPaise, ids.map(() => 1)));

    case SPLIT_METHODS.PERCENTAGE: {
      const bps = allocations.map((a) => a.value);
      if (bps.some((bp) => !Number.isInteger(bp) || bp <= 0)) return fail('Each percentage must be more than 0');
      const total = bps.reduce((s, bp) => s + bp, 0);
      if (total !== FULL_PERCENT_BP) {
        return fail(`Percentages add up to ${formatPercent(total)}, not 100%`);
      }
      return withShares(distribute(amountPaise, bps));
    }

    case SPLIT_METHODS.CUSTOM: {
      const values = allocations.map((a) => a.value);
      if (values.some((v) => !Number.isInteger(v))) return fail('Enter an amount for each person');
      const total = values.reduce((s, v) => s + v, 0);
      if (total !== amountPaise) return { ...fail('Custom amounts must add up to the transaction amount'), difference: amountPaise - total };
      return withShares(values);
    }

    default:
      return fail('Unknown split method');
  }
}

/** 3333 -> "33.33%", 5000 -> "50%" */
export function formatPercent(bp) {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return `${bp < 0 && whole === 0 ? '-' : ''}${whole}${frac ? `.${String(frac).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
}

export const ASSIGNMENT = {
  UNASSIGNED: 'unassigned',
  INVALID: 'invalid',
  ASSIGNED: 'assigned',
};

/** Assignment state of a transaction or adjustment ({ amountPaise, split }). */
export function assignmentState(item, knownPersonIds) {
  if (!item.split) return { state: ASSIGNMENT.UNASSIGNED, result: fail('Not assigned') };
  const result = allocate(item.amountPaise, item.split, knownPersonIds);
  return { state: result.ok ? ASSIGNMENT.ASSIGNED : ASSIGNMENT.INVALID, result };
}
