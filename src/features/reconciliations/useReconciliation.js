import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { storage } from '../../services/storage';
import { onRecordsChanged } from '../../services/storage/events';
import { deriveStatus } from '../../services/calculations/reconciliation';
import { createAdjustment, createCard, createPerson, createTransaction, normalizeReconciliation, now, touch } from '../model';
import { withMe } from '../user/currentUser';

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

const RETRY_DELAY_MS = 3000;

/**
 * Loads one reconciliation and saves every change straight away.
 * Changes come from discrete actions (a dialog submit, a delete), never keystrokes, so there is
 * no debounce: a debounce window is a window in which closing the tab loses data. Writes are
 * serialised — while one is in flight, only the latest state is queued.
 * Mount it with `key={id}` so switching reconciliations starts from fresh state.
 * `currentUser` (if signed in) is added to the reconciliation's people when it loads.
 * saveStatus: 'saved' | 'saving' | 'error'
 * loadState:  'loading' | 'ready' | 'missing' | 'error'
 */
export function useReconciliation(id, currentUser = null) {
  const [rec, setRec] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [saveStatus, setSaveStatus] = useState('saved');
  // People saved on this device for reuse across reconciliations.
  const [savedPeople, setSavedPeople] = useState([]);

  // { role: 'owner' | 'editor' | 'viewer', shared, ownerName } — always owner in local-only mode.
  const [access, setAccess] = useState({ role: 'owner', shared: false, ownerName: null });

  const recRef = useRef(null);
  const savedPeopleRef = useRef([]);
  const canEditRef = useRef(true);
  const pendingRef = useRef(null); // latest unsaved state
  const savingRef = useRef(false);

  const flush = useCallback(async () => {
    if (savingRef.current) return; // the running loop picks up the latest pending state
    savingRef.current = true;
    try {
      while (pendingRef.current) {
        const data = pendingRef.current;
        pendingRef.current = null;
        setSaveStatus('saving');
        try {
          await storage.saveReconciliation(data);
        } catch (err) {
          console.error('Save failed', err);
          pendingRef.current ??= data;
          setSaveStatus('error');
          return;
        }
      }
      setSaveStatus('saved');
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([storage.getReconciliation(id), storage.listPeople(), storage.getAccess(id)])
      .then(([stored, people, accessInfo]) => {
        if (cancelled) return;
        const normalized = normalizeReconciliation(stored) ?? null;
        const editable = accessInfo.role !== 'viewer';
        // Make sure the signed-in person is part of every reconciliation they can edit.
        const data = editable ? withMe(normalized, currentUser) : normalized;
        recRef.current = data;
        savedPeopleRef.current = people;
        canEditRef.current = editable;
        setAccess(accessInfo);
        setRec(data);
        setSavedPeople(people);
        setLoadState(data ? 'ready' : 'missing');
        if (data !== normalized) {
          pendingRef.current = data;
          flush();
        }
      })
      .catch((err) => {
        console.error('Failed to load reconciliation', err);
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
      flush();
    };
  }, [id, currentUser, flush]);

  // Reload when sync brings in changes from another device or person — unless a local edit is
  // still being saved, in which case the sync engine merges it and notifies again afterwards.
  useEffect(
    () =>
      onRecordsChanged((ids) => {
        if (ids && !ids.includes(id)) return;
        if (pendingRef.current || savingRef.current) return;
        Promise.all([storage.getReconciliation(id), storage.listPeople(), storage.getAccess(id)]).then(
          ([stored, people, accessInfo]) => {
            if (pendingRef.current || savingRef.current) return;
            const data = normalizeReconciliation(stored) ?? null;
            recRef.current = data;
            savedPeopleRef.current = people;
            canEditRef.current = accessInfo.role !== 'viewer';
            setAccess(accessInfo);
            setRec(data);
            setSavedPeople(people);
            setLoadState(data ? 'ready' : 'missing');
          },
        );
      }),
    [id],
  );

  // Warn before leaving while a save is still in flight or has failed.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (pendingRef.current || savingRef.current) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flush]);

  // Retry a failed save after a short pause (a new change also retries immediately).
  useEffect(() => {
    if (saveStatus !== 'error') return undefined;
    const timer = setTimeout(flush, RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [saveStatus, flush]);

  const update = useCallback(
    (fn) => {
      const prev = recRef.current;
      if (!prev || !canEditRef.current) return; // viewers cannot change shared data
      const changed = fn(prev);
      const next = { ...changed, status: deriveStatus(changed) };
      recRef.current = next;
      pendingRef.current = next;
      setRec(next);
      flush();
    },
    [flush],
  );

  const rememberPerson = useCallback((person) => {
    const others = savedPeopleRef.current.filter((p) => p.id !== person.id);
    const next = [...others, person].sort((a, b) => a.name.localeCompare(b.name));
    savedPeopleRef.current = next;
    setSavedPeople(next);
    storage.savePerson(person).catch((err) => console.error('Failed to save person', err));
  }, []);

  const actions = useMemo(
    () => ({
      /**
       * Add a person to this reconciliation by saved person or by name. Reuses an existing
       * person with the same name rather than creating a duplicate. Returns the person.
       */
      addPerson: (input) => {
        const current = recRef.current.people;
        const name = input.name.trim();
        const existing =
          current.find((p) => p.id === input.id) ?? current.find((p) => sameName(p.name, name));
        if (existing) return existing;
        const person =
          (input.id && { id: input.id, name }) ||
          savedPeopleRef.current.find((p) => sameName(p.name, name)) ||
          createPerson({ name });
        update((r) => ({ ...r, people: [...r.people, touch(person)] }));
        rememberPerson(person);
        return person;
      },
      renamePerson: (personId, name) => {
        const person = { id: personId, name: name.trim() };
        update((r) => ({ ...r, people: r.people.map((p) => (p.id === personId ? touch(person) : p)) }));
        rememberPerson(person);
      },
      /** Callers must check isPersonUsed first; removing a referenced person would orphan splits. */
      removePerson: (personId) => update((r) => ({ ...r, people: r.people.filter((p) => p.id !== personId) })),

      addAdjustment: (fields) => {
        const adjustment = createAdjustment(fields);
        update((r) => ({ ...r, adjustments: [...r.adjustments, adjustment] }));
        return adjustment;
      },
      updateAdjustment: (adjustmentId, fields) =>
        update((r) => ({
          ...r,
          adjustments: r.adjustments.map((a) => (a.id === adjustmentId ? touch({ ...a, ...fields }) : a)),
        })),
      deleteAdjustment: (adjustmentId) =>
        update((r) => ({ ...r, adjustments: r.adjustments.filter((a) => a.id !== adjustmentId) })),

      updateDetails: (fields) => update((r) => ({ ...r, ...fields, detailsUpdatedAt: now() })),

      addCard: (fields) => {
        const card = createCard(fields);
        update((r) => ({ ...r, cards: [...r.cards, card] }));
        return card;
      },
      updateCard: (cardId, fields) =>
        update((r) => ({ ...r, cards: r.cards.map((c) => (c.id === cardId ? touch({ ...c, ...fields }) : c)) })),
      deleteCard: (cardId) =>
        update((r) => ({
          ...r,
          cards: r.cards.filter((c) => c.id !== cardId),
          transactions: r.transactions.filter((t) => t.cardId !== cardId),
        })),

      addTransaction: (fields) => {
        const txn = createTransaction(fields);
        update((r) => ({ ...r, transactions: [...r.transactions, txn] }));
        return txn;
      },
      /** Add many transactions in one change (used by statement import). */
      addTransactions: (list) => {
        const txns = list.map(createTransaction);
        update((r) => ({ ...r, transactions: [...r.transactions, ...txns] }));
        return txns;
      },
      updateTransaction: (txnId, fields) =>
        update((r) => ({
          ...r,
          transactions: r.transactions.map((t) => (t.id === txnId ? touch({ ...t, ...fields }) : t)),
        })),
      deleteTransaction: (txnId) =>
        update((r) => ({ ...r, transactions: r.transactions.filter((t) => t.id !== txnId) })),
    }),
    [update, rememberPerson],
  );

  return {
    rec,
    loadState,
    saveStatus,
    savedPeople,
    access,
    canEdit: access.role !== 'viewer',
    saveNow: flush,
    ...actions,
  };
}
