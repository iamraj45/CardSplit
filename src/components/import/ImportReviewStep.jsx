import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DUPLICATE } from '../../features/import/reviewRows';
import { TXN_KIND } from '../../services/import/statementParser';
import { formatINR } from '../../utils/currency';
import { formatDate } from '../../utils/dates';

export const NEW_CARD = 'new';

/**
 * Review and correct parsed transactions before saving.
 * `summary` is computed by the parent (it also gates the Import button).
 */
export default function ImportReviewStep({
  rec,
  meta,
  fixedCardId,
  target,
  onTargetChange,
  newCard,
  onNewCardChange,
  newCardErrors,
  updateCardDetails,
  onUpdateCardDetailsChange,
  rows,
  rowChecks,
  onRowChange,
  onToggleAll,
  assignTo,
  onAssignToChange,
  summary,
}) {
  const card = rec.cards.find((c) => c.id === target);
  const detected = [
    meta.cardName,
    meta.last4 && `•••• ${meta.last4}`,
    meta.periodStart && `${formatDate(meta.periodStart)} – ${formatDate(meta.periodEnd)}`,
    meta.totalDuePaise != null && `Total due ${formatINR(meta.totalDuePaise)}`,
  ].filter(Boolean);
  const detailsDiffer =
    card &&
    ((meta.totalDuePaise != null && meta.totalDuePaise !== card.statementTotalPaise) ||
      (meta.periodStart && (meta.periodStart !== card.statementStart || meta.periodEnd !== card.statementEnd)));
  const allIncluded = rows.length > 0 && rows.every((r) => r.include);
  const someIncluded = rows.some((r) => r.include);

  return (
    <Stack spacing={2}>
      {detected.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          Detected from statement: {detected.join(' · ')}
        </Typography>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'flex-start' } }}>
        <FormControl size="small" sx={{ minWidth: 260 }} disabled={Boolean(fixedCardId)}>
          <InputLabel id="import-target">Import into</InputLabel>
          <Select labelId="import-target" label="Import into" value={target} onChange={(e) => onTargetChange(e.target.value)}>
            {rec.cards.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} •••• {c.last4}
              </MenuItem>
            ))}
            <MenuItem value={NEW_CARD}>New card from this statement</MenuItem>
          </Select>
        </FormControl>
        {rec.people.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="import-assign" shrink>
              Assign imported to
            </InputLabel>
            <Select
              labelId="import-assign"
              label="Assign imported to"
              notched
              displayEmpty
              value={assignTo}
              onChange={(e) => onAssignToChange(e.target.value)}
            >
              <MenuItem value="">Nobody yet (assign later)</MenuItem>
              {rec.people.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      {target === NEW_CARD && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            New card
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              size="small"
              label="Card name"
              value={newCard.name}
              onChange={(e) => onNewCardChange({ name: e.target.value })}
              error={Boolean(newCardErrors.name)}
              helperText={newCardErrors.name || ' '}
              sx={{ flex: 2 }}
            />
            <TextField
              size="small"
              label="Last 4 digits"
              value={newCard.last4}
              onChange={(e) => onNewCardChange({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
              error={Boolean(newCardErrors.last4)}
              helperText={newCardErrors.last4 || ' '}
              sx={{ flex: 1, minWidth: 120 }}
            />
            <TextField
              size="small"
              type="date"
              label="Statement from"
              value={newCard.statementStart}
              onChange={(e) => onNewCardChange({ statementStart: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(newCardErrors.statementStart)}
              helperText={newCardErrors.statementStart || ' '}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="date"
              label="Statement to"
              value={newCard.statementEnd}
              onChange={(e) => onNewCardChange({ statementEnd: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              error={Boolean(newCardErrors.statementEnd)}
              helperText={newCardErrors.statementEnd || ' '}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Statement total"
              value={newCard.total}
              onChange={(e) => onNewCardChange({ total: e.target.value })}
              slotProps={{
                htmlInput: { inputMode: 'decimal' },
                input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
              }}
              error={Boolean(newCardErrors.total)}
              helperText={newCardErrors.total || 'Total amount due'}
              sx={{ flex: 1, minWidth: 140 }}
            />
          </Stack>
        </Paper>
      )}

      {card && meta.last4 && meta.last4 !== card.last4 && (
        <Alert severity="warning">
          This statement looks like it is for card •••• {meta.last4}, but you are importing into •••• {card.last4}.
        </Alert>
      )}

      {card && detailsDiffer && (
        <FormControlLabel
          control={<Checkbox checked={updateCardDetails} onChange={(e) => onUpdateCardDetailsChange(e.target.checked)} />}
          label={
            <Typography variant="body2">
              Also update this card from the statement
              {meta.totalDuePaise != null && meta.totalDuePaise !== card.statementTotalPaise
                ? ` — total ${formatINR(card.statementTotalPaise)} → ${formatINR(meta.totalDuePaise)}`
                : ''}
              {meta.periodStart && (meta.periodStart !== card.statementStart || meta.periodEnd !== card.statementEnd)
                ? `, period ${formatDate(meta.periodStart)} – ${formatDate(meta.periodEnd)}`
                : ''}
            </Typography>
          }
        />
      )}

      <SummaryBar summary={summary} />

      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: { md: '50vh' } }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allIncluded}
                  indeterminate={someIncluded && !allIncluded}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  slotProps={{ input: { 'aria-label': 'Include all' } }}
                />
              </TableCell>
              <TableCell>Date</TableCell>
              <TableCell sx={{ minWidth: 220 }}>Expense name</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => {
              const check = rowChecks[i];
              const showErrors = row.include && check.errors.length > 0;
              return (
                <TableRow key={row.key} hover sx={{ opacity: row.include ? 1 : 0.55 }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={row.include}
                      onChange={(e) => onRowChange(i, { include: e.target.checked })}
                      slotProps={{ input: { 'aria-label': `Include ${row.expenseName || row.description}` } }}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <TextField
                      size="small"
                      type="date"
                      variant="standard"
                      value={row.date ?? ''}
                      onChange={(e) => onRowChange(i, { date: e.target.value })}
                      error={showErrors && check.errors.includes('Invalid date')}
                      slotProps={{ htmlInput: { 'aria-label': 'Date' } }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      variant="standard"
                      fullWidth
                      value={row.expenseName}
                      onChange={(e) => onRowChange(i, { expenseName: e.target.value })}
                      error={showErrors && check.errors.includes('Expense name required')}
                      slotProps={{ htmlInput: { 'aria-label': 'Expense name' } }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {row.description}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      variant="standard"
                      value={row.amountInput}
                      onChange={(e) => onRowChange(i, { amountInput: e.target.value })}
                      error={showErrors && check.errors.some((e) => e.startsWith('Amount') || e === 'Invalid amount')}
                      slotProps={{
                        htmlInput: { inputMode: 'decimal', 'aria-label': 'Amount', style: { textAlign: 'right' } },
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                      {row.kind === TXN_KIND.PAYMENT && <Chip size="small" label="Bill payment" />}
                      {row.kind === TXN_KIND.CREDIT && <Chip size="small" color="success" variant="outlined" label="Credit" />}
                      {row.duplicate === DUPLICATE.EXISTING && (
                        <Chip size="small" color="warning" variant="outlined" label="Already on card?" />
                      )}
                      {row.duplicate === DUPLICATE.IN_FILE && (
                        <Chip size="small" color="warning" variant="outlined" label="Repeated in file" />
                      )}
                      {showErrors && <Chip size="small" color="error" label={check.errors.join(', ')} />}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="caption" color="text.secondary">
        Bill payments (paying off the previous statement) are excluded by default because they are not expenses.
        Cashback and refunds are kept as negative amounts.
      </Typography>
    </Stack>
  );
}

function SummaryBar({ summary }) {
  const { includedCount, includedPaise, excludedPayments, statementTotalPaise, afterImportPaise, invalidCount } = summary;
  const difference = statementTotalPaise != null ? statementTotalPaise - afterImportPaise : null;
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }}>
        <Figure label={`Importing (${includedCount})`} value={formatINR(includedPaise)} />
        <Figure label="Card total after import" value={formatINR(afterImportPaise)} />
        <Figure label="Statement total" value={statementTotalPaise != null ? formatINR(statementTotalPaise) : '—'} />
        {difference != null && (
          <Figure
            label="Difference"
            value={formatINR(difference)}
            color={difference === 0 ? 'success.main' : 'warning.main'}
          />
        )}
      </Stack>
      <Box sx={{ mt: 1.5 }}>
        {invalidCount > 0 ? (
          <Alert severity="error">Fix or exclude {invalidCount} row(s) with errors before importing.</Alert>
        ) : includedCount === 0 ? (
          <Alert severity="info">
            No transactions are selected. Rows that look like they are already on this card start unticked — tick any
            you still want to import.
          </Alert>
        ) : difference === 0 ? (
          <Alert severity="success">The imported transactions match the statement total.</Alert>
        ) : difference != null ? (
          <Alert severity="warning">
            After import the card would be {formatINR(Math.abs(difference))} {difference > 0 ? 'short of' : 'over'} the
            statement total. You can still import and correct it afterwards.
          </Alert>
        ) : null}
        {excludedPayments.count > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {excludedPayments.count} bill payment(s) of {formatINR(Math.abs(excludedPayments.paise))} excluded.
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function Figure({ label, value, color }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, color }}>
        {value}
      </Typography>
    </Box>
  );
}
