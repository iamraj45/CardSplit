// The person using the app on this device. There is no authentication: the name only lets the app
// assign expenses to "me" and add me to reconciliations. Kept in localStorage as a per-device
// convenience; if it is lost, the login page simply asks for the name again.

import { createContext, useContext } from 'react';

const KEY = 'ccr.currentUser';

export function loadCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem(KEY));
    return user && typeof user.name === 'string' && typeof user.personId === 'string' ? user : null;
  } catch {
    return null;
  }
}

export function saveCurrentUser(user) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable — the user stays signed in for this session only
  }
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The current user's entry in a list of people. Matched by name first, so a backup restored on
 * another device (where the saved person may have a different id) still recognises "me".
 */
export function findMe(people, user) {
  if (!user) return null;
  return people.find((p) => sameName(p.name, user.name)) ?? people.find((p) => p.id === user.personId) ?? null;
}

/** The reconciliation with the current user added to its people, or the same object if already there. */
export function withMe(rec, user) {
  if (!rec || !user || findMe(rec.people, user)) return rec;
  return { ...rec, people: [...rec.people, { id: user.personId, name: user.name }] };
}

/** { user, signIn(name), signOut() } — provided by UserProvider. */
export const UserContext = createContext({ user: null, signIn: async () => {}, signOut: () => {} });

export function useCurrentUser() {
  return useContext(UserContext);
}
