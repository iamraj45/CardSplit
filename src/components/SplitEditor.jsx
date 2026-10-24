import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import PersonPicker from './PersonPicker';
import { findMe, useCurrentUser } from '../features/user/currentUser';
import {
  FULL_PERCENT_BP,
  SPLIT_METHODS,
  distribute,
  formatPercent,
  percentToBasisPoints,
} from '../services/calculations/splitCalculations';
import { formatINR, paiseToInput, rupeesToPaise } from '../utils/currency';

const METHOD_OPTIONS = [
  { value: 'none', label: 'Assign later' },
  { value: SPLIT_METHODS.SINGLE, label: 'One person' },
  { value: SPLIT_METHODS.EQUAL, label: 'Equal' },
  { value: SPLIT_METHODS.PERCENTAGE, label: 'Percentage' },
  { value: SPLIT_METHODS.CUSTOM, label: 'Custom' },
];

const ME = 'me';

const usesInputs = (method) => method === SPLIT_METHODS.PERCENTAGE || method === SPLIT_METHODS.CUSTOM;

/**
 * Edits a split draft (see features/splits/splitDraft.js).
 * `evaluation` is splitFromDraft(draft, amountPaise, people), computed by the parent so it can
 * block saving on errors. `showErrors` turns validation messages red after a save attempt.
 */
export default function SplitEditor({ draft, onChange, amountPaise, people, savedPeople, onAddPerson, evaluation, showErrors }) {
  const sharesById = new Map((evaluation?.result?.shares ?? []).map((s) => [s.personId, s.paise]));
  const { user } = useCurrentUser();
  const me = findMe(people, user);
  const isMe = draft.method === SPLIT_METHODS.SINGLE && me && draft.personIds[0] === me.id;
  const options = user
    ? [METHOD_OPTIONS[0], { value: ME, label: `${user.name} (me)` }, ...METHOD_OPTIONS.slice(1)]
    : METHOD_OPTIONS;

  const selectOption = (value) => {
    if (value === ME) {
      // One click: the whole amount to the signed-in person (added to this reconciliation if needed).
      const person = me ?? onAddPerson({ id: user.personId, name: user.name });
      if (person) onChange({ ...draft, method: SPLIT_METHODS.SINGLE, personIds: [person.id] });
      return;
    }
    if (value === SPLIT_METHODS.SINGLE && isMe) {
      onChange({ ...draft, personIds: [] }); // "One person" from "me": let them pick someone else
      return;
    }
    setMethod(value);
  };

  const setMethod = (value) => {
    const method = value === 'none' ? null : value;
    let { personIds, inputs } = draft;
    if (method === SPLIT_METHODS.SINGLE) personIds = personIds.slice(0, 1);
    // Pre-fill an even split for the people already selected, so switching methods is quick.
    if (usesInputs(method) && Object.values(inputs).every((v) => !v?.trim()) && personIds.length > 0) {
      const even =
        method === SPLIT_METHODS.PERCENTAGE
          ? distribute(FULL_PERCENT_BP, personIds.map(() => 1)).map((bp) => paiseToInput(bp).replace(/\.00$/, ''))
          : amountPaise != null
            ? distribute(amountPaise, personIds.map(() => 1)).map(paiseToInput)
            : [];
      inputs = Object.fromEntries(personIds.map((id, i) => [id, even[i] ?? '']));
    }
    if (method === SPLIT_METHODS.EQUAL || method === SPLIT_METHODS.SINGLE) {
      // Keep the people that had values when coming from percentage/custom.
      const fromInputs = people.filter((p) => inputs[p.id]?.trim()).map((p) => p.id);
      if (personIds.length === 0 && fromInputs.length) {
        personIds = method === SPLIT_METHODS.SINGLE ? fromInputs.slice(0, 1) : fromInputs;
      }
    }
    onChange({ method, personIds, inputs });
  };

  const togglePerson = (personId) => {
    if (draft.method === SPLIT_METHODS.SINGLE) {
      onChange({ ...draft, personIds: [personId] });
      return;
    }
    const selected = draft.personIds.includes(personId);
    onChange({
      ...draft,
      personIds: selected ? draft.personIds.filter((id) => id !== personId) : [...draft.personIds, personId],
    });
  };

  const setInput = (personId, value) => onChange({ ...draft, inputs: { ...draft.inputs, [personId]: value } });

  const handleAddPerson = (input) => {
    const person = onAddPerson(input);
    if (!person) return;
    if (draft.method === SPLIT_METHODS.SINGLE) onChange({ ...draft, personIds: [person.id] });
    else if (draft.method === SPLIT_METHODS.EQUAL && !draft.personIds.includes(person.id)) {
      onChange({ ...draft, personIds: [...draft.personIds, person.id] });
    }
  };

  const remaining = usesInputs(draft.method) ? remainingFor(draft, people, amountPaise) : null;

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Who pays for this?</Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={isMe ? ME : (draft.method ?? 'none')}
        onChange={(_, value) => value && selectOption(value)}
        sx={(theme) => ({
          flexWrap: 'wrap',
          // On phones the options wrap onto several rows, so show them as separate pills.
          [theme.breakpoints.down('sm')]: {
            gap: 1,
            '& .MuiToggleButtonGroup-grouped': {
              border: `1px solid ${theme.palette.divider} !important`,
              borderRadius: '8px !important',
              marginLeft: '0 !important',
            },
          },
        })}
      >
        {options.map((o) => (
          <ToggleButton key={o.value} value={o.value} sx={{ textTransform: 'none', px: 1.5 }}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {draft.method && people.length === 0 && (
        <Alert severity="info">Add the people who share these expenses, then choose who pays.</Alert>
      )}

      {(draft.method === SPLIT_METHODS.SINGLE || draft.method === SPLIT_METHODS.EQUAL) && people.length > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {people.map((p) => {
            const selected = draft.personIds.includes(p.id);
            const share = sharesById.get(p.id);
            return (
              <Chip
                key={p.id}
                label={selected && share != null && draft.method === SPLIT_METHODS.EQUAL ? `${p.name} · ${formatINR(share)}` : p.name}
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                onClick={() => togglePerson(p.id)}
                aria-pressed={selected}
              />
            );
          })}
          {draft.method === SPLIT_METHODS.EQUAL && people.length > 1 && (
            <Chip
              label="Everyone"
              variant="outlined"
              onClick={() => onChange({ ...draft, personIds: people.map((p) => p.id) })}
            />
          )}
        </Stack>
      )}

      {usesInputs(draft.method) && people.length > 0 && (
        <Stack spacing={1}>
          {people.map((p) => {
            const share = sharesById.get(p.id);
            return (
              <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                  {p.name}
                </Typography>
                {draft.method === SPLIT_METHODS.PERCENTAGE && share != null && (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {formatINR(share)}
                  </Typography>
                )}
                <TextField
                  size="small"
                  value={draft.inputs[p.id] ?? ''}
                  onChange={(e) => setInput(p.id, e.target.value)}
                  placeholder="0"
                  slotProps={{
                    htmlInput: { inputMode: 'decimal', 'aria-label': `${p.name} ${draft.method === SPLIT_METHODS.PERCENTAGE ? 'percentage' : 'amount'}` },
                    input:
                      draft.method === SPLIT_METHODS.PERCENTAGE
                        ? { endAdornment: <InputAdornment position="end">%</InputAdornment> }
                        : { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
                  }}
                  sx={{ width: 140, flexShrink: 0 }}
                />
              </Stack>
            );
          })}
          {remaining && (
            <Typography
              variant="body2"
              sx={{ textAlign: 'right', color: remaining.done ? 'success.main' : 'text.secondary' }}
            >
              {remaining.text}
            </Typography>
          )}
        </Stack>
      )}

      {draft.method && evaluation?.error && (
        <Typography variant="body2" color={showErrors ? 'error' : 'text.secondary'} role={showErrors ? 'alert' : undefined}>
          {evaluation.error}
        </Typography>
      )}

      {draft.method && (
        <Box>
          <PersonPicker savedPeople={savedPeople} currentPeople={people} onAdd={handleAddPerson} />
        </Box>
      )}
    </Stack>
  );
}

/** Running total for percentage/custom inputs, ignoring rows that don't parse yet. */
function remainingFor(draft, people, amountPaise) {
  const isPercent = draft.method === SPLIT_METHODS.PERCENTAGE;
  const target = isPercent ? FULL_PERCENT_BP : amountPaise;
  if (target == null) return null;
  const parse = isPercent ? percentToBasisPoints : rupeesToPaise;
  const total = people.reduce((sum, p) => sum + (parse(draft.inputs[p.id] ?? '') ?? 0), 0);
  const left = target - total;
  const fmt = isPercent ? formatPercent : formatINR;
  if (left === 0) return { done: true, text: `✓ Adds up to ${fmt(target)}` };
  return { done: false, text: left > 0 ? `${fmt(left)} left to assign` : `${fmt(-left)} over` };
}
