import { useCallback, useMemo, useState } from 'react';
import { createPerson } from '../model';
import { storage } from '../../services/storage';
import { UserContext, findMe, loadCurrentUser, saveCurrentUser } from './currentUser';

export default function UserProvider({ children }) {
  const [user, setUser] = useState(loadCurrentUser);

  /** Sign in by name: reuse a saved person with that name, or save a new one. */
  const signIn = useCallback(async (rawName) => {
    const name = rawName.trim();
    const people = await storage.listPeople();
    const person = findMe(people, { name, personId: '' }) ?? createPerson({ name });
    await storage.savePerson(person);
    const next = { personId: person.id, name: person.name };
    saveCurrentUser(next);
    setUser(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    saveCurrentUser(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
