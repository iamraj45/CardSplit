import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import SplitEditor from './SplitEditor';
import { draftFromSplit, splitFromDraft } from '../features/splits/splitDraft';
import { paiseToInput, rupeesToPaise } from '../utils/currency';

/**
 * Add or edit an external adjustment — an amount outside any card statement
 * (e.g. a trip or a loan repayment) that only affects person totals.
 * Render with a `key` so the form resets each time it opens.
 */
export default function AdjustmentEditor({ open, initial, people, savedPeople, onAddPerson, onSubmit, onClose }) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial ? paiseToInput(initial.amountPaise) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [splitDraft, setSplitDraft] = useState(() => draftFromSplit(initial?.split));
  const [submitted, setSubmitted] = useState(false);

  const amountPaise = rupeesToPaise(amount);
  const evaluation = splitFromDraft(splitDraft, amountPaise, people);
  const errors = {
    name: !name.trim() && 'Name is required',
    amount:
      amountPaise == null ? 'Enter an amount, e.g. 1000 or 541.50' : amountPaise === 0 && 'Amount cannot be zero',
    split: evaluation.error,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (field) => (submitted && errors[field]) || ' ';

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    onSubmit({ name: name.trim(), amountPaise, note: note.trim(), split: evaluation.split });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Edit adjustment' : 'Add external adjustment'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <Alert severity="info" variant="outlined">
              External adjustments are not part of any card statement. They only change each person’s consolidated
              total.
            </Alert>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pondicherry, Slice"
              error={submitted && Boolean(errors.name)}
              helperText={show('name')}
              autoFocus
              required
              fullWidth
            />
            <TextField
              label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              slotProps={{
                htmlInput: { inputMode: 'decimal' },
                input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
              }}
              error={submitted && Boolean(errors.amount)}
              helperText={submitted && errors.amount ? errors.amount : 'Use a negative amount for money owed back'}
              required
              fullWidth
            />
            <TextField
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText=" "
              fullWidth
            />
            <Divider />
            <SplitEditor
              draft={splitDraft}
              onChange={setSplitDraft}
              amountPaise={amountPaise}
              people={people}
              savedPeople={savedPeople}
              onAddPerson={onAddPerson}
              evaluation={evaluation}
              showErrors={submitted}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            {isEdit ? 'Save' : 'Add adjustment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
