import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useIsPhone } from '../utils/useIsPhone';
import { formatPeriod, isValidISODate, periodsOverlap } from '../utils/dates';

/**
 * Create or edit a reconciliation's name and period.
 * `existing` are summaries of other saved reconciliations, used for duplicate warnings.
 * Render with a `key` so the form resets each time it opens.
 */
export default function ReconciliationFormDialog({ open, initial, existing = [], onSubmit, onClose }) {
  const isPhone = useIsPhone();
  const isEdit = Boolean(initial);
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const datesValid = isValidISODate(periodStart) && isValidISODate(periodEnd);
  const orderError = datesValid && periodEnd < periodStart;
  const suggestedName = datesValid && !orderError ? formatPeriod(periodStart, periodEnd) : '';
  const finalName = name.trim() || suggestedName;

  const others = existing.filter((r) => r.id !== initial?.id);
  const conflicts =
    datesValid && !orderError
      ? others.filter(
          (r) =>
            periodsOverlap(periodStart, periodEnd, r.periodStart, r.periodEnd) ||
            r.name.trim().toLowerCase() === finalName.toLowerCase(),
        )
      : [];

  const canSubmit = datesValid && !orderError && finalName;
  const needsAck = conflicts.length > 0 && !acknowledged;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!canSubmit) return;
    if (needsAck) {
      setAcknowledged(true);
      return;
    }
    onSubmit({ name: finalName, periodStart, periodEnd });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isPhone}>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Edit reconciliation' : 'New reconciliation'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Period start"
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setAcknowledged(false);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
                error={submitted && !isValidISODate(periodStart)}
                required
                fullWidth
              />
              <TextField
                label="Period end"
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setAcknowledged(false);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
                error={(submitted && !isValidISODate(periodEnd)) || orderError}
                helperText={orderError ? 'End must be on or after start' : ' '}
                required
                fullWidth
              />
            </Stack>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAcknowledged(false);
              }}
              placeholder={suggestedName || 'e.g. March – April 2026'}
              helperText={!name.trim() && suggestedName ? `Will be saved as “${suggestedName}”` : ' '}
              error={submitted && !finalName}
              fullWidth
            />
            {conflicts.length > 0 && (
              <Alert severity="warning">
                This looks like a duplicate of:{' '}
                {conflicts.map((c) => `${c.name} (${formatPeriod(c.periodStart, c.periodEnd)})`).join(', ')}.
                {acknowledged ? ' Click again to save anyway.' : ''}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            {conflicts.length > 0 && acknowledged ? 'Save anyway' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
