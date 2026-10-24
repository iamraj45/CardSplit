import { useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import SplitEditor from './SplitEditor';
import { draftFromSplit, splitFromDraft } from '../features/splits/splitDraft';
import { SPLIT_METHODS } from '../services/calculations/splitCalculations';
import { paiseToInput, rupeesToPaise } from '../utils/currency';
import { formatDate, isValidISODate } from '../utils/dates';

/**
 * Add or edit a card transaction. "Expense name" is the only user-facing name field;
 * any imported original description is kept as reference only.
 * Render with a `key` so the form resets each time it opens.
 */
export default function ExpenseEditor({
  open,
  initial,
  card,
  defaultDate,
  defaultSplit,
  people,
  savedPeople,
  onAddPerson,
  onSubmit,
  onClose,
}) {
  const isEdit = Boolean(initial);
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? '');
  const [expenseName, setExpenseName] = useState(initial?.expenseName ?? '');
  const [amount, setAmount] = useState(initial ? paiseToInput(initial.amountPaise) : '');
  const [splitDraft, setSplitDraft] = useState(() => draftFromSplit(isEdit ? initial.split : defaultSplit));
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef(null);

  const amountPaise = rupeesToPaise(amount);
  const evaluation = splitFromDraft(splitDraft, amountPaise, people);
  const errors = {
    date: !isValidISODate(date) && 'Required',
    expenseName: !expenseName.trim() && 'Expense name is required',
    amount:
      amountPaise == null
        ? 'Enter an amount, e.g. 499 or -250 for a refund'
        : amountPaise === 0 && 'Amount cannot be zero',
    split: evaluation.error,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (field) => (submitted && errors[field]) || ' ';

  const outsidePeriod =
    isValidISODate(date) && card && (date < card.statementStart || date > card.statementEnd);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    onSubmit({ date, expenseName: expenseName.trim(), amountPaise, split: evaluation.split });
    if (e.nativeEvent.submitter?.name === 'another') {
      // Ready for the next entry; keep the date and split since statements are usually entered in order.
      // Custom amounts belong to this transaction only, so those are cleared.
      setExpenseName('');
      setAmount('');
      if (splitDraft.method === SPLIT_METHODS.CUSTOM) setSplitDraft({ ...splitDraft, inputs: {} });
      setSubmitted(false);
      nameRef.current?.focus();
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{isEdit ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={submitted && Boolean(errors.date)}
              helperText={show('date')}
              required
              sx={{ maxWidth: 220 }}
            />
            <TextField
              label="Expense name"
              value={expenseName}
              onChange={(e) => setExpenseName(e.target.value)}
              placeholder="e.g. Dentist, H&M, Recharge"
              inputRef={nameRef}
              error={submitted && Boolean(errors.expenseName)}
              helperText={show('expenseName')}
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
              helperText={submitted && errors.amount ? errors.amount : 'Use a negative amount for refunds or credits'}
              required
              fullWidth
            />
            {outsidePeriod && (
              <Alert severity="warning">
                This date is outside the statement period ({formatDate(card.statementStart)} –{' '}
                {formatDate(card.statementEnd)}).
              </Alert>
            )}
            {initial?.originalDescription && (
              <Alert severity="info" variant="outlined">
                Statement description: {initial.originalDescription}
              </Alert>
            )}
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
          {!isEdit && (
            <Button type="submit" name="another">
              Save &amp; add another
            </Button>
          )}
          <Button type="submit" variant="contained">
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
