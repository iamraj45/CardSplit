import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { LAST4_PATTERN } from '../features/model';
import { paiseToInput, rupeesToPaise } from '../utils/currency';
import { isValidISODate } from '../utils/dates';

/**
 * Add or edit a credit card. Only the card name and last four digits are collected.
 * Render with a `key` so the form resets each time it opens.
 */
export default function CardFormDialog({ open, initial, defaultPeriod, onSubmit, onClose }) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [statementStart, setStatementStart] = useState(initial?.statementStart ?? defaultPeriod?.start ?? '');
  const [statementEnd, setStatementEnd] = useState(initial?.statementEnd ?? defaultPeriod?.end ?? '');
  const [total, setTotal] = useState(initial ? paiseToInput(initial.statementTotalPaise) : '');
  const [submitted, setSubmitted] = useState(false);

  const totalPaise = rupeesToPaise(total);
  const errors = {
    name: !name.trim() && 'Card name is required',
    last4: !LAST4_PATTERN.test(last4) && 'Enter exactly 4 digits',
    statementStart: !isValidISODate(statementStart) && 'Required',
    statementEnd: !isValidISODate(statementEnd)
      ? 'Required'
      : statementEnd < statementStart && 'End must be on or after start',
    total: totalPaise == null && 'Enter an amount, e.g. 6623 or 6,623.50',
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (field) => (submitted && errors[field]) || ' ';

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    onSubmit({ name: name.trim(), last4, statementStart, statementEnd, statementTotalPaise: totalPaise });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Edit card' : 'Add credit card'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <TextField
              label="Card name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC Swiggy Credit Card"
              error={submitted && Boolean(errors.name)}
              helperText={show('name')}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label="Last 4 digits"
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              slotProps={{
                htmlInput: { inputMode: 'numeric', maxLength: 4, autoComplete: 'off' },
                input: { startAdornment: <InputAdornment position="start">••••</InputAdornment> },
              }}
              error={submitted && Boolean(errors.last4)}
              helperText={show('last4')}
              required
              sx={{ maxWidth: 220 }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Statement from"
                type="date"
                value={statementStart}
                onChange={(e) => setStatementStart(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                error={submitted && Boolean(errors.statementStart)}
                helperText={show('statementStart')}
                required
                fullWidth
              />
              <TextField
                label="Statement to"
                type="date"
                value={statementEnd}
                onChange={(e) => setStatementEnd(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                error={submitted && Boolean(errors.statementEnd)}
                helperText={show('statementEnd')}
                required
                fullWidth
              />
            </Stack>
            <TextField
              label="Statement total"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              slotProps={{
                htmlInput: { inputMode: 'decimal' },
                input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
              }}
              error={submitted && Boolean(errors.total)}
              helperText={show('total')}
              required
              fullWidth
            />
            <Alert severity="info" variant="outlined">
              Never enter the full card number or CVV — only the last four digits are stored.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            {isEdit ? 'Save' : 'Add card'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
