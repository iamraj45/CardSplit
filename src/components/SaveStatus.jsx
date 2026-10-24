import Chip from '@mui/material/Chip';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';

const STATES = {
  saved: { label: 'Saved on this device', icon: <CloudDoneOutlined />, color: 'default' },
  saving: { label: 'Saving…', icon: <SyncOutlined />, color: 'default' },
  error: { label: 'Save failed — will retry', icon: <ErrorOutlined />, color: 'error' },
};

export default function SaveStatus({ status }) {
  const s = STATES[status] ?? STATES.saved;
  return <Chip size="small" variant="outlined" icon={s.icon} label={s.label} color={s.color} />;
}
