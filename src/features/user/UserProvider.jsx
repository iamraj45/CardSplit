import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPerson } from '../model';
import { localStorageAdapter } from '../../services/storage';
import { createIndexedDbStorage } from '../../services/storage/indexedDbStorage';
import { accountsEnabled, supabase } from '../../services/supabase/client';
import { fetchProfile, saveProfile } from '../../services/sync/remote';
import { UserContext, cacheProfile, findMe, loadCachedProfile, loadCurrentUser, saveCurrentUser } from './currentUser';

const localUser = () => {
  const saved = loadCurrentUser();
  return saved ? { ...saved, mode: 'local' } : null;
};

const accountUser = (session, profile) => ({
  mode: 'account',
  userId: session.user.id,
  email: session.user.email,
  personId: profile?.person_id ?? null,
  name: profile?.display_name ?? '',
  needsProfile: !profile,
});

export default function UserProvider({ children }) {
  const [user, setUser] = useState(() => (accountsEnabled ? null : localUser()));
  const [ready, setReady] = useState(!accountsEnabled);

  // --- account session ---
  // No session at start-up → the local-only user, if any. Signing out of an account → the login page.
  const applySession = useCallback(async (session, { signedOut = false } = {}) => {
    if (!session) {
      setUser(signedOut ? null : localUser());
      return;
    }
    const cached = loadCachedProfile(session.user.id);
    setUser(accountUser(session, cached)); // works offline from the cached profile
    try {
      const profile = await fetchProfile(supabase, session.user.id);
      if (profile) cacheProfile(profile);
      if (profile || !cached) setUser(accountUser(session, profile ?? cached));
    } catch (err) {
      console.warn('Could not refresh profile (offline?)', err);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => !cancelled && applySession(data.session))
      .finally(() => !cancelled && setReady(true));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') applySession(null, { signedOut: true });
      else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') applySession(session);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [applySession]);

  // --- local (no account) ---
  /** Continue without an account: reuse a saved person with that name, or save a new one. */
  const signIn = useCallback(async (rawName) => {
    const name = rawName.trim();
    const people = await localStorageAdapter.listPeople();
    const person = findMe(people, { name, personId: '' }) ?? createPerson({ name });
    await localStorageAdapter.savePerson(person);
    const next = { personId: person.id, name: person.name };
    saveCurrentUser(next);
    setUser({ ...next, mode: 'local' });
    return next;
  }, []);

  // --- account sign-in ---
  const sendSignInEmail = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email, code) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw error;
  }, []);

  /** First sign-in: choose a display name. Reuses the local "me" so existing data still recognises you. */
  const completeProfile = useCallback(
    async (rawName) => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) throw new Error('Not signed in');
      const name = rawName.trim();
      const local = loadCurrentUser();
      const personId = local && findMe([{ id: local.personId, name: local.name }], { name, personId: '' }) ? local.personId : crypto.randomUUID();
      const profile = await saveProfile(supabase, { id: session.user.id, email: session.user.email, display_name: name, person_id: personId });
      cacheProfile(profile);
      setUser(accountUser(session, profile));
    },
    [],
  );

  const signOut = useCallback(
    async ({ removeData = false } = {}) => {
      if (user?.mode === 'account') {
        const cache = removeData ? createIndexedDbStorage(`ccr-${user.userId}`) : null;
        await supabase.auth.signOut({ scope: 'local' });
        if (cache) await cache.destroy().catch((err) => console.error(err));
        return;
      }
      saveCurrentUser(null);
      setUser(null);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, ready, accountsEnabled, signIn, sendSignInEmail, verifyCode, completeProfile, signOut }),
    [user, ready, signIn, sendSignInEmail, verifyCode, completeProfile, signOut],
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
