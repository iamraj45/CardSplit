import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import UploadLocalDataDialog from '../../components/UploadLocalDataDialog';
import { localStorageAdapter, setStorageAdapter } from '../../services/storage';
import { emitRecordsChanged } from '../../services/storage/events';
import { createIndexedDbStorage } from '../../services/storage/indexedDbStorage';
import { createSyncedStorage } from '../../services/storage/syncedStorage';
import { supabase } from '../../services/supabase/client';
import { createSupabaseRemote } from '../../services/sync/remote';
import { SYNC_STATUS, createSyncEngine } from '../../services/sync/syncEngine';
import { useCurrentUser } from '../user/currentUser';
import { SyncContext, describeConflicts } from './syncContext';

const SYNC_DELAY_MS = 800; // batch rapid edits into one push
const SYNC_INTERVAL_MS = 60000; // fallback in case realtime events are missed

function debounce(fn, ms) {
  let timer;
  const call = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}

/** Which local-only reconciliations this account has already been offered (per device). */
const offeredKey = (userId) => `ccr.uploadOffered.${userId}`;
function readOffered(userId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(offeredKey(userId))) ?? []);
  } catch {
    return new Set();
  }
}
function writeOffered(userId, ids) {
  try {
    localStorage.setItem(offeredKey(userId), JSON.stringify([...ids]));
  } catch {
    // will simply be offered again
  }
}

/**
 * Chooses the storage adapter for the session and, when signed in, runs background sync.
 * Children are remounted when switching between local and an account, so screens reload their data.
 */
export default function SyncProvider({ children }) {
  const { user } = useCurrentUser();
  const accountId = user?.mode === 'account' && !user.needsProfile ? user.userId : null;
  const [status, setStatus] = useState({ status: SYNC_STATUS.IDLE, pending: 0, error: null });
  const [notices, setNotices] = useState([]);
  const [uploadCandidates, setUploadCandidates] = useState(null);
  const firstSyncDone = useRef(false);

  const notify = useCallback((message) => setNotices((list) => [...list, { id: Math.random(), message }]), []);

  // Build the account's storage, remote and engine once per account.
  const session = useMemo(() => {
    if (!accountId) return null;
    const cache = createIndexedDbStorage(`ccr-${accountId}`);
    const remote = createSupabaseRemote(supabase, accountId);
    const engine = createSyncEngine({
      cache,
      remote,
      emit: emitRecordsChanged,
      onStatus: setStatus,
      onConflicts: (id, name, conflicts) => notify(describeConflicts(name, conflicts)),
      onNotice: notify,
    });
    const scheduleSync = debounce(() => engine.syncNow(), SYNC_DELAY_MS);
    const synced = createSyncedStorage(cache, { onLocalChange: scheduleSync });
    return { cache, remote, engine, synced, cancelTimer: scheduleSync.cancel };
  }, [accountId, notify]);

  // Point `storage` at the right adapter before children render (idempotent).
  setStorageAdapter(session ? session.synced : localStorageAdapter);

  useEffect(() => {
    if (!session) return undefined;
    const { engine, remote } = session;
    firstSyncDone.current = false;
    const sync = () => engine.syncNow();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(sync, SYNC_INTERVAL_MS);
    let unsubscribe = () => {};
    try {
      unsubscribe = remote.subscribe(sync);
    } catch (err) {
      console.warn('Live updates unavailable', err);
    }
    sync();
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
      session.cancelTimer();
      unsubscribe();
    };
  }, [session]);

  // After the first successful sync, offer to upload reconciliations kept in local-only mode.
  useEffect(() => {
    if (!session || firstSyncDone.current || status.status !== SYNC_STATUS.SYNCED) return;
    firstSyncDone.current = true;
    localStorageAdapter
      .exportBackup()
      .then(({ reconciliations, people }) => {
        const offered = readOffered(accountId);
        const fresh = reconciliations.filter((r) => !offered.has(r.id));
        if (fresh.length) setUploadCandidates({ reconciliations: fresh, people });
      })
      .catch((err) => console.warn('Could not read local data', err));
  }, [session, status.status, accountId]);

  const closeUpload = (handledIds) => {
    const offered = readOffered(accountId);
    for (const id of handledIds) offered.add(id);
    writeOffered(accountId, offered);
    setUploadCandidates(null);
  };

  const value = useMemo(
    () => ({
      enabled: Boolean(session),
      status,
      syncNow: () => session?.engine.syncNow(),
      remote: session?.remote ?? null,
    }),
    [session, status],
  );

  const notice = notices[0];
  return (
    <SyncContext.Provider value={value}>
      <Fragment key={accountId ?? 'local'}>{children}</Fragment>
      {uploadCandidates && (
        <UploadLocalDataDialog
          candidates={uploadCandidates}
          onUploaded={(ids, count) => {
            closeUpload(uploadCandidates.reconciliations.map((r) => r.id));
            emitRecordsChanged(ids);
            if (count) notify(`${count} reconciliation${count === 1 ? '' : 's'} added to your account.`);
          }}
          onDismiss={() => closeUpload(uploadCandidates.reconciliations.map((r) => r.id))}
        />
      )}
      <Snackbar
        key={notice?.id}
        open={Boolean(notice)}
        autoHideDuration={7000}
        onClose={(_, reason) => reason !== 'clickaway' && setNotices((list) => list.slice(1))}
        message={notice?.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ displayPrint: 'none' }}
      />
    </SyncContext.Provider>
  );
}
