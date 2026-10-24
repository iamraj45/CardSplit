import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PersonRemoveOutlined from '@mui/icons-material/PersonRemoveOutlined';
import { useSync } from '../features/sync/syncContext';
import { useIsPhone } from '../utils/useIsPhone';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLE_LABEL = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

/**
 * Who has access to a reconciliation. Owners invite by email (people without an account get access
 * when they first sign in with that email), change roles and remove people; others can leave.
 */
export default function ShareDialog({ open, rec, access, currentEmail, onLeave, onClose }) {
  const isPhone = useIsPhone();
  const { remote, syncNow, status } = useSync();
  const isOwner = access.role === 'owner';
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      await syncNow(); // a new reconciliation must reach the server before it can be shared
      const list = await remote.listMembers(rec.id);
      if (list.length === 0) {
        setError('This reconciliation has not synced yet. Connect to the internet and try again.');
        setMembers([]);
      } else {
        setMembers(list);
      }
    } catch (err) {
      console.error(err);
      setError('Could not load who has access — check your connection.');
      setMembers([]);
    }
  }, [remote, rec.id, syncNow]);

  useEffect(() => {
    if (open) Promise.resolve().then(load);
  }, [open, load]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      await load();
    } catch (err) {
      console.error(err);
      setError(err.message || 'That did not work — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const invite = (e) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    if (address === currentEmail?.toLowerCase()) {
      setError('That is your own email.');
      return;
    }
    run(async () => {
      const res = await remote.invite(rec.id, address, role);
      setEmail('');
      setInfo(
        res.status === 'added'
          ? `${address} can now ${role === 'editor' ? 'edit' : 'view'} this reconciliation.`
          : res.status === 'already'
            ? `${address} already has access.`
            : `Invitation saved. ${address} will get access when they sign in to CardSplit with that email — let them know.`,
      );
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isPhone}>
      <DialogTitle>Share “{rec.name}”</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {info && <Alert severity="success">{info}</Alert>}
          {status.status === 'offline' && <Alert severity="warning">You are offline. Sharing needs a connection.</Alert>}

          {isOwner && (
            <Stack component="form" onSubmit={invite} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="Invite by email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ flex: 1 }}
              />
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <Select value={role} onChange={(e) => setRole(e.target.value)} inputProps={{ 'aria-label': 'Access level' }}>
                  <MenuItem value="editor">Can edit</MenuItem>
                  <MenuItem value="viewer">Can view</MenuItem>
                </Select>
              </FormControl>
              <Button type="submit" variant="contained" disabled={busy || !email.trim()}>
                Invite
              </Button>
            </Stack>
          )}

          <Typography variant="subtitle2">People with access</Typography>
          {members === null ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Stack spacing={1}>
              {members.map((m) => {
                const key = m.user_id ?? m.email;
                const isMe = m.email && m.email.toLowerCase() === currentEmail?.toLowerCase();
                return (
                  <Stack key={key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 500 }}>
                        {m.display_name ?? m.email}
                        {isMe ? ' (you)' : ''}
                      </Typography>
                      {m.display_name && (
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                          {m.email}
                        </Typography>
                      )}
                    </Box>
                    {m.pending && <Chip size="small" variant="outlined" label="Invited" />}
                    {isOwner && m.role !== 'owner' && !m.pending ? (
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select
                          value={m.role}
                          onChange={(e) => run(() => remote.setRole(rec.id, m.user_id, e.target.value))}
                          disabled={busy}
                          inputProps={{ 'aria-label': `Access for ${m.email}` }}
                        >
                          <MenuItem value="editor">Can edit</MenuItem>
                          <MenuItem value="viewer">Can view</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {ROLE_LABEL[m.role]}
                      </Typography>
                    )}
                    {isOwner && m.role !== 'owner' && (
                      <Tooltip title={m.pending ? 'Cancel invitation' : 'Remove access'}>
                        <IconButton
                          size="small"
                          disabled={busy}
                          onClick={() => run(() => remote.removeMember(rec.id, m.user_id, m.pending ? m.email : null))}
                          aria-label={`Remove ${m.email}`}
                        >
                          <PersonRemoveOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary">
            Editors can change transactions, splits and people. Viewers can see the reconciliation and its report.
            Everyone with access sees changes as they sync.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        {!isOwner && (
          <Button color="error" onClick={onLeave} sx={{ mr: 'auto' }}>
            Leave
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
