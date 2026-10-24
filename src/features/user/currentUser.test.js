import { describe, expect, it } from 'vitest';
import { findMe, withMe } from './currentUser';

const user = { personId: 'p-me', name: 'Abhishek' };

describe('findMe', () => {
  it('matches by name (case-insensitive) before id', () => {
    expect(findMe([{ id: 'other-id', name: 'abhishek ' }], user)).toEqual({ id: 'other-id', name: 'abhishek ' });
    expect(findMe([{ id: 'p-me', name: 'Abhi' }], user)).toEqual({ id: 'p-me', name: 'Abhi' });
    expect(findMe([{ id: 'x', name: 'Akansha' }], user)).toBeNull();
    expect(findMe([{ id: 'x', name: 'Akansha' }], null)).toBeNull();
  });
});

describe('withMe', () => {
  const rec = { id: 'r', people: [{ id: 'ak', name: 'Akansha' }] };

  it('adds the current user once', () => {
    const next = withMe(rec, user);
    expect(next.people).toEqual([{ id: 'ak', name: 'Akansha' }, { id: 'p-me', name: 'Abhishek', updatedAt: expect.any(String) }]);
    expect(withMe(next, user)).toBe(next);
  });

  it('leaves the reconciliation alone without a user', () => {
    expect(withMe(rec, null)).toBe(rec);
  });
});
