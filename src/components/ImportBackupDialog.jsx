import { useState } from 'react';
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
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { IMPORT_ACTION, parseBackup, planImport, resolvePlan } from '../features/backups/backup';
import { storage } from '../services/storage';
import { formatDate, formatPeriod } from '../utils/dates';

const when = (iso) => (iso ? `${formatDate(iso.slice(0, 10))}, ${iso.slice(11, 16)}` : 'unknown');

/** Restore reconciliations from a JSON backup, asking what to do with ones that already exist here. */
export default function ImportBackupDialog({ open, existing, onDone, onClose }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(null);
  const [plan, setPlan] = useState([]);

  const pickFile = async (file) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const result = parseBackup(await file.text());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.backup.reconciliations.length === 0) {
        setError('This backup contains no reconciliations.');
        return;
      }
      setBackup({ ...result.backup, fileName: file.name });
      setPlan(planImport(result.backup.reconciliations, existing));
    } catch (err) {
      console.error(err);
      setError('The file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const setAction = (i, action) => setPlan(plan.map((p, j) => (j === i ? { ...p, action } : p)));
  const { toSave, counts } = resolvePlan(plan);

  const doImport = async () => {
    setBusy(true);
    try {
      await storage.importBackup({ reconciliations: toSave, people: backup.people });
      onDone(counts);
    } catch (err) {
      console.error(err);
      setError('Saving failed — nothing was imported. Please try again.');
      setBusy(false);
    }
  };

  const conflicts = plan.filter((p) => p.existing).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import backup</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {!backup && (
            <Box
              component="label"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                p: 4,
                border: 2,
                borderStyle: 'dashed',
                borderColor: 'divider',
                borderRadius: 3,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <input
                type="file"
                hidden
                accept=".json,application/json"
                data-testid="backup-file"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {busy ? <CircularProgress size={36} /> : <UploadFileOutlined sx={{ fontSize: 44, color: 'text.secondary' }} />}
              <Typography variant="h6">Choose a backup file (.json)</Typography>
              <Typography variant="body2" color="text.secondary">
                Use a file made with “Export backup” on this or another device.
              </Typography>
            </Box>
          )}

          {backup && (
            <>
              <Typography variant="body2" color="text.secondary">
                {backup.fileName} · exported {when(backup.exportedAt)} · {backup.reconciliations.length} reconciliation
                {backup.reconciliations.length === 1 ? '' : 's'}
              </Typography>
              {conflicts > 0 && (
                <Alert severity="warning">
                  {conflicts} reconciliation{conflicts === 1 ? ' is' : 's are'} already saved here. Choose whether to
                  skip, replace or keep both. Replacing overwrites the copy on this device.
                </Alert>
              )}
              <Stack spacing={1}>
                {plan.map((p, i) => (
                  <Paper key={p.rec.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography sx={{ fontWeight: 600 }}>{p.rec.name}</Typography>
                          <Chip
                            size="small"
                            label={p.existing ? 'Already here' : 'New'}
                            color={p.existing ? 'warning' : 'success'}
                            variant="outlined"
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {formatPeriod(p.rec.periodStart, p.rec.periodEnd)} · {p.rec.cards.length} card
                          {p.rec.cards.length === 1 ? '' : 's'} · {p.rec.transactions.length} transaction
                          {p.rec.transactions.length === 1 ? '' : 's'}
                        </Typography>
                        {p.existing && (
                          <Typography variant="caption" color="text.secondary">
                            On this device: updated {when(p.existing.updatedAt)} · In backup: updated {when(p.rec.updatedAt)}
                          </Typography>
                        )}
                      </Box>
                      {p.existing && (
                        <FormControl size="small" sx={{ minWidth: 190 }}>
                          <Select
                            value={p.action}
                            onChange={(e) => setAction(i, e.target.value)}
                            inputProps={{ 'aria-label': `What to do with ${p.rec.name}` }}
                          >
                            <MenuItem value={IMPORT_ACTION.SKIP}>Skip (keep mine)</MenuItem>
                            <MenuItem value={IMPORT_ACTION.REPLACE}>Replace with backup</MenuItem>
                            <MenuItem value={IMPORT_ACTION.COPY}>Keep both</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {backup && (
          <Button onClick={() => setBackup(null)} sx={{ mr: 'auto' }}>
            Choose another file
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        {backup && (
          <Button variant="contained" onClick={doImport} disabled={busy || toSave.length === 0}>
            Import {toSave.length} reconciliation{toSave.length === 1 ? '' : 's'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
