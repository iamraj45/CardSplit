import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useIsPhone } from '../utils/useIsPhone';
import { formatPeriod, isValidISODate, periodsOverlap } from '../utils/dates';

/**
 * Create or edit a reconciliation's name and period.
 * `existing` are summaries of other saved reconciliations, used for duplicate warnings.
 * `savedCards` (new reconciliations only) are offered to carry over; the ticked ones are passed
 * to onSubmit as `cards`.
 * Render with a `key` so the form resets each time it opens.
 */
export default function ReconciliationFormDialog({ open, initial, existing = [], savedCards = [], onSubmit, onClose }) {
  const isPhone = useIsPhone();
  const isEdit = Boolean(initial);
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [unticked, setUnticked] = useState(() => new Set()); // keys of saved cards not to carry over

  const toggleCard = (key, ticked) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (ticked) next.delete(key);
      else next.add(key);
      return next;
    });

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
    const cards = isEdit ? undefined : savedCards.filter((c) => !unticked.has(c.key));
    onSubmit({ name: finalName, periodStart, periodEnd, cards });
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
            {!isEdit && savedCards.length > 0 && (
              <Stack>
                <Typography variant="subtitle2">Cards</Typography>
                <Typography variant="body2" color="text.secondary">
                  Your saved cards are added with the next statement dates. Untick any you don’t need.
                </Typography>
                {savedCards.map((c) => (
                  <FormControlLabel
                    key={c.key}
                    control={<Checkbox checked={!unticked.has(c.key)} onChange={(e) => toggleCard(c.key, e.target.checked)} />}
                    label={`${c.name} •••• ${c.last4}`}
                  />
                ))}
              </Stack>
            )}
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
