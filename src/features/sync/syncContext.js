import { createContext, useContext } from 'react';
import { SYNC_STATUS } from '../../services/sync/syncEngine';

/**
 * { enabled, status: { status, pending, error, lastSyncedAt }, syncNow(), remote (sharing API) }
 * `enabled` is false in local-only mode.
 */
export const SyncContext = createContext({
  enabled: false,
  status: { status: SYNC_STATUS.IDLE, pending: 0, error: null },
  syncNow: () => {},
  remote: null,
});

export function useSync() {
  return useContext(SyncContext);
}

/** Plain-language summary of a merge for a notice. */
export function describeConflicts(recName, conflicts) {
  const names = [...new Set(conflicts.map((c) => (c.kind === 'details' ? 'the reconciliation details' : `‘${c.name}’`)))];
  const shown = names.slice(0, 2).join(' and ') + (names.length > 2 ? ` and ${names.length - 2} more` : '');
  const deleted = conflicts.some((c) => c.deletedElsewhere);
  return deleted
    ? `“${recName}”: ${shown} was deleted in one place but edited in another — the edit was kept.`
    : `“${recName}”: ${shown} ${names.length === 1 ? 'was' : 'were'} changed in two places — the newer edit was kept.`;
}
