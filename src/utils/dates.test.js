import { describe, expect, it } from 'vitest';
import { formatDate, formatPeriod, isValidISODate, periodsOverlap } from './dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-2-3')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('formats dates and periods', () => {
    expect(formatDate('2026-03-05')).toBe('5 Mar 2026');
    expect(formatPeriod('2026-03-15', '2026-04-14')).toBe('March – April 2026');
    expect(formatPeriod('2026-03-01', '2026-03-31')).toBe('March 2026');
    expect(formatPeriod('2025-12-15', '2026-01-14')).toBe('December 2025 – January 2026');
  });

  it('detects overlapping periods inclusively', () => {
    expect(periodsOverlap('2026-03-15', '2026-04-14', '2026-04-14', '2026-05-14')).toBe(true);
    expect(periodsOverlap('2026-03-15', '2026-04-14', '2026-04-15', '2026-05-14')).toBe(false);
  });
});
