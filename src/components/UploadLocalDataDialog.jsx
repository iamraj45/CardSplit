import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
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
import { IMPORT_ACTION, planImport, resolvePlan, validateReconciliation } from '../features/backups/backup';
import { storage } from '../services/storage';
import { formatPeriod } from '../utils/dates';
import { useIsPhone } from '../utils/useIsPhone';

/**
 * After signing in on a device that has local-only data: offer to copy it into the account.
 * Local data is left untouched (it is still there in "continue without an account" mode).
 */
export default function UploadLocalDataDialog({ candidates, onUploaded, onDismiss }) {
  const isPhone = useIsPhone();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const valid = candidates.reconciliations.map(validateReconciliation).filter((r) => r.ok).map((r) => r.rec);
    storage.listReconciliations().then((existing) => {
      if (cancelled) return;
      // Default to adding everything; on an id clash keep the account's copy unless told otherwise.
      setPlan(planImport(valid, existing));
    });
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  if (!plan) return null;
  const { toSave } = resolvePlan(plan);
  const setAction = (i, action) => setPlan(plan.map((p, j) => (j === i ? { ...p, action } : p)));

  const upload = async () => {
    setBusy(true);
    setError(null);
    try {
      await storage.importBackup({ reconciliations: toSave, people: candidates.people });
      onUploaded(toSave.map((r) => r.id), toSave.length);
    } catch (err) {
      console.error(err);
      setError('Could not add the data. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onDismiss} maxWidth="sm" fullWidth fullScreen={isPhone}>
      <DialogTitle>Add data from this device to your account?</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            These reconciliations were saved on this device without an account. Add them to your account to sync
            them to your other devices. The copies on this device are kept either way.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {plan.map((p, i) => (
            <Paper key={p.rec.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                <div>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 600 }}>{p.rec.name}</Typography>
                    {p.existing && <Chip size="small" color="warning" variant="outlined" label="Already in account" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {formatPeriod(p.rec.periodStart, p.rec.periodEnd)} · {p.rec.cards.length} card
                    {p.rec.cards.length === 1 ? '' : 's'} · {p.rec.transactions.length} transactions
                  </Typography>
                </div>
                {p.existing && (
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <Select value={p.action} onChange={(e) => setAction(i, e.target.value)} inputProps={{ 'aria-label': `What to do with ${p.rec.name}` }}>
                      <MenuItem value={IMPORT_ACTION.SKIP}>Keep the account copy</MenuItem>
                      <MenuItem value={IMPORT_ACTION.REPLACE}>Replace with this device’s copy</MenuItem>
                      <MenuItem value={IMPORT_ACTION.COPY}>Keep both</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDismiss} disabled={busy}>
          Not now
        </Button>
        <Button variant="contained" onClick={upload} disabled={busy || toSave.length === 0}>
          Add {toSave.length} to my account
        </Button>
      </DialogActions>
    </Dialog>
  );
}
