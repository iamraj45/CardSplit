// The person using the app. Two modes:
//   local   — no account: just a name, kept in localStorage; data stays in this browser.
//   account — signed in with Supabase (email magic link); data syncs. The profile (display name
//             and a stable person id) is cached in localStorage so the app also starts offline.
// User shape: { mode, personId, name, userId?, email?, needsProfile? }

import { createContext, useContext } from 'react';

const KEY = 'ccr.currentUser';
const PROFILE_KEY = (userId) => `ccr.profile.${userId}`;

export function loadCachedProfile(userId) {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY(userId)));
  } catch {
    return null;
  }
}

export function cacheProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY(profile.id), JSON.stringify(profile));
  } catch {
    // not cached: the profile is fetched again next time
  }
}

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
  return { ...rec, people: [...rec.people, { id: user.personId, name: user.name, updatedAt: new Date().toISOString() }] };
}

/**
 * Provided by UserProvider:
 * { user, ready, accountsEnabled, signIn(name), sendSignInEmail(email), verifyCode(email, code),
 *   completeProfile(name), signOut({ removeData }) }
 */
export const UserContext = createContext({
  user: null,
  ready: true,
  accountsEnabled: false,
  signIn: async () => {},
  sendSignInEmail: async () => {},
  verifyCode: async () => {},
  completeProfile: async () => {},
  signOut: async () => {},
});

export function useCurrentUser() {
  return useContext(UserContext);
}
