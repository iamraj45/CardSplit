// Export helpers shared by the dashboard and reconciliation pages.
import { storage } from '../../services/storage';
import { downloadJson } from '../../utils/download';
import { backupFileName, createBackup } from './backup';

const LAST_BACKUP_KEY = 'ccr.lastBackupAt';

/** When this device last exported a full backup (ISO string), or null. Per-device convenience only. */
export function getLastBackupAt() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function setLastBackupAt(iso) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    // storage unavailable — the reminder will just keep showing
  }
}

/** Download a backup of everything, or of one reconciliation (with only the people it uses). */
export async function exportBackupFile(single) {
  const data = await storage.exportBackup(single ? { ids: [single.id] } : undefined);
  const people = single ? data.people.filter((p) => single.people.some((q) => q.id === p.id)) : data.people;
  const now = new Date();
  downloadJson(backupFileName(single?.name, now), createBackup({ reconciliations: data.reconciliations, people }, now));
  if (!single) setLastBackupAt(now.toISOString());
  return data.reconciliations.length;
}

export const BACKUP_REMINDER_DAYS = 30;

export function backupIsStale(lastBackupAt, now = Date.now()) {
  if (!lastBackupAt) return true;
  return now - Date.parse(lastBackupAt) > BACKUP_REMINDER_DAYS * 86400000;
}
