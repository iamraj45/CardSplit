import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import SyncProblemOutlined from '@mui/icons-material/SyncProblemOutlined';
import { useSync } from '../features/sync/syncContext';
import { SYNC_STATUS } from '../services/sync/syncEngine';

const LOCAL = {
  saved: { label: 'Saved on this device', icon: <CloudDoneOutlined />, color: 'default' },
  saving: { label: 'Saving…', icon: <SyncOutlined />, color: 'default' },
  error: { label: 'Save failed — will retry', icon: <ErrorOutlined />, color: 'error' },
};

/**
 * Save state for the open reconciliation. In local-only mode it reports the save to this browser;
 * when signed in it also reports sync with the account (offline edits are queued, not lost).
 */
export default function SaveStatus({ status }) {
  const sync = useSync();
  if (!sync.enabled || status !== 'saved') {
    const s = LOCAL[status] ?? LOCAL.saved;
    return <Chip size="small" variant="outlined" icon={s.icon} label={s.label} color={s.color} />;
  }

  const { status: state, pending, error } = sync.status;
  let chip;
  if (state === SYNC_STATUS.OFFLINE) {
    chip = { label: pending ? `Offline — ${pending} to sync` : 'Offline', icon: <CloudOffOutlined />, color: 'warning', tip: 'Changes are saved on this device and will sync when you are back online.' };
  } else if (state === SYNC_STATUS.ERROR) {
    chip = { label: 'Sync problem — retry', icon: <SyncProblemOutlined />, color: 'error', tip: error ?? 'Sync failed.', onClick: sync.syncNow };
  } else if (state === SYNC_STATUS.SYNCING || pending > 0) {
    chip = { label: 'Syncing…', icon: <SyncOutlined />, color: 'default' };
  } else {
    chip = { label: 'Synced', icon: <CloudDoneOutlined />, color: 'success', tip: 'Saved to your account.' };
  }
  const element = (
    <Chip size="small" variant="outlined" icon={chip.icon} label={chip.label} color={chip.color} onClick={chip.onClick} />
  );
  return chip.tip ? <Tooltip title={chip.tip}>{element}</Tooltip> : element;
}
