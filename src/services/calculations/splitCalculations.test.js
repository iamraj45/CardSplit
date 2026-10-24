import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT,
  allocate,
  assignmentState,
  distribute,
  formatPercent,
  percentToBasisPoints,
} from './splitCalculations';

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const paise = (result) => result.shares.map((s) => s.paise);

describe('distribute', () => {
  it('splits evenly when divisible', () => {
    expect(distribute(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it('gives leftover paise to the earliest people on ties', () => {
    expect(distribute(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(distribute(1001, [1, 1, 1])).toEqual([334, 334, 333]);
  });

  it('gives leftover paise to the largest remainder for weighted splits', () => {
    // 100 paise at 33.33 / 33.33 / 33.34 -> raw 33.33, 33.33, 33.34
    expect(distribute(100, [3333, 3333, 3334])).toEqual([33, 33, 34]);
  });

  it('keeps the sign for refunds', () => {
    expect(distribute(-1000, [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  it('handles amounts smaller than the number of people', () => {
    expect(distribute(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(distribute(-2, [1, 1, 1])).toEqual([-1, -1, 0]);
  });

  it('always sums exactly to the amount', () => {
    for (const amount of [1, 7, 99, 100, 12345, 662300, -54101, 9999999]) {
      for (const weights of [[1, 1], [1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [2500, 2500, 5000], [1, 9999], [3333, 3333, 3334]]) {
        expect(sum(distribute(amount, weights))).toBe(amount);
      }
    }
  });

  it('is deterministic', () => {
    expect(distribute(1000, [1, 1, 1])).toEqual(distribute(1000, [1, 1, 1]));
  });
});

describe('allocate', () => {
  it('assigns everything to one person', () => {
    const r = allocate(662300, { method: 'single', allocations: [{ personId: 'a', value: null }] });
    expect(r.ok).toBe(true);
    expect(r.shares).toEqual([{ personId: 'a', paise: 662300 }]);
  });

  it('rejects a single split with two people', () => {
    const r = allocate(100, { method: 'single', allocations: [{ personId: 'a' }, { personId: 'b' }] });
    expect(r.ok).toBe(false);
  });

  it('splits equally to the paisa', () => {
    const r = allocate(10000, { method: 'equal', allocations: [{ personId: 'a' }, { personId: 'b' }, { personId: 'c' }] });
    expect(paise(r)).toEqual([3334, 3333, 3333]);
  });

  it('splits by percentage', () => {
    const split = { method: 'percentage', allocations: [{ personId: 'a', value: 6000 }, { personId: 'b', value: 4000 }] };
    expect(paise(allocate(698200, split))).toEqual([418920, 279280]);
    expect(paise(allocate(1, split))).toEqual([1, 0]);
  });

  it('rejects percentages that do not total 100%', () => {
    const r = allocate(100, { method: 'percentage', allocations: [{ personId: 'a', value: 6000 }, { personId: 'b', value: 3000 }] });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Percentages add up to 90%, not 100%');
  });

  it('rejects zero or negative percentages', () => {
    const r = allocate(100, { method: 'percentage', allocations: [{ personId: 'a', value: 10000 }, { personId: 'b', value: 0 }] });
    expect(r.ok).toBe(false);
  });

  it('accepts custom amounts that sum exactly', () => {
    const split = { method: 'custom', allocations: [{ personId: 'a', value: 288000 }, { personId: 'b', value: 410200 }] };
    expect(paise(allocate(698200, split))).toEqual([288000, 410200]);
  });

  it('reports the difference when custom amounts do not sum', () => {
    const split = { method: 'custom', allocations: [{ personId: 'a', value: 288000 }, { personId: 'b', value: 410000 }] };
    const r = allocate(698200, split);
    expect(r.ok).toBe(false);
    expect(r.difference).toBe(200);
  });

  it('supports custom refunds', () => {
    const split = { method: 'custom', allocations: [{ personId: 'a', value: -6000 }, { personId: 'b', value: -4050 }] };
    expect(allocate(-10050, split).ok).toBe(true);
  });

  it('rejects duplicate and unknown people', () => {
    expect(allocate(100, { method: 'equal', allocations: [{ personId: 'a' }, { personId: 'a' }] }).ok).toBe(false);
    const r = allocate(100, { method: 'single', allocations: [{ personId: 'x' }] }, new Set(['a']));
    expect(r.error).toBe('Assigned to a removed person');
  });

  it('treats missing split as unassigned', () => {
    expect(allocate(100, null).ok).toBe(false);
  });
});

describe('assignmentState', () => {
  it('classifies items', () => {
    expect(assignmentState({ amountPaise: 100, split: null }).state).toBe(ASSIGNMENT.UNASSIGNED);
    expect(assignmentState({ amountPaise: 100, split: { method: 'custom', allocations: [{ personId: 'a', value: 50 }] } }).state).toBe(
      ASSIGNMENT.INVALID,
    );
    expect(assignmentState({ amountPaise: 100, split: { method: 'single', allocations: [{ personId: 'a' }] } }).state).toBe(
      ASSIGNMENT.ASSIGNED,
    );
  });
});

describe('percent helpers', () => {
  it('parses and formats percentages', () => {
    expect(percentToBasisPoints('33.33')).toBe(3333);
    expect(percentToBasisPoints('50%')).toBe(5000);
    expect(percentToBasisPoints('12.345')).toBeNull();
    expect(formatPercent(10000)).toBe('100%');
    expect(formatPercent(3333)).toBe('33.33%');
    expect(formatPercent(1250)).toBe('12.5%');
    expect(formatPercent(9000)).toBe('90%');
  });
});
