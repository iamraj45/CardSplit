import { describe, expect, it } from 'vitest';
import { formatINR, paiseToInput, rupeesToPaise } from './currency';

describe('rupeesToPaise', () => {
  it.each([
    ['6623', 662300],
    ['6623.5', 662350],
    ['6623.50', 662350],
    ['6,623.00', 662300],
    ['1,23,456.78', 12345678],
    ['₹ 541', 54100],
    ['0.1', 10],
    ['0.01', 1],
    ['-250', -25000],
    ['-0.05', -5],
    ['  42  ', 4200],
    [6623.5, 662350],
  ])('parses %j as %i paise', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '1.2.3', '--5', '5-', '.5', null, undefined])('rejects %j', (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });

  it('avoids floating point error', () => {
    // 0.1 + 0.2 !== 0.3 in floats; integer paise stays exact.
    expect(rupeesToPaise('0.1') + rupeesToPaise('0.2')).toBe(rupeesToPaise('0.3'));
  });

  it('normalises -0 to 0', () => {
    expect(Object.is(rupeesToPaise('-0'), 0)).toBe(true);
  });
});

describe('paiseToInput', () => {
  it.each([
    [662300, '6623.00'],
    [5, '0.05'],
    [-25050, '-250.50'],
    [0, '0.00'],
  ])('formats %i as %j', (paise, expected) => {
    expect(paiseToInput(paise)).toBe(expected);
  });

  it('round-trips through rupeesToPaise', () => {
    for (const p of [1, 99, 100, 662350, -12345]) {
      expect(rupeesToPaise(paiseToInput(p))).toBe(p);
    }
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
    expect(formatINR(662300)).toBe('₹6,623.00');
  });

  it('formats negatives', () => {
    expect(formatINR(-54100)).toBe('-₹541.00');
  });

  it('drops .00 in compact mode but never rounds paise away', () => {
    expect(formatINR(662300, { compact: true })).toBe('₹6,623');
    expect(formatINR(662350, { compact: true })).toBe('₹6,623.50');
    expect(formatINR(-6000, { compact: true })).toBe('-₹60');
  });
});
