import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatINR } from '../utils/currency';

function Figure({ label, value, color }) {
  return (
    <Box sx={{ minWidth: { xs: 0, sm: 140 }, flex: { xs: 1, sm: 'none' } }}>
      <Typography variant="caption" color="text.secondary" noWrap component="div">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, color, fontSize: { xs: '0.95rem', sm: '1.25rem' }, whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Statement total vs entered transactions for one card. Differences are shown, never auto-corrected. */
export default function ReconciliationStatus({ statementTotalPaise, enteredTotalPaise, transactionCount }) {
  const difference = statementTotalPaise - enteredTotalPaise;
  const matched = transactionCount > 0 && difference === 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" sx={{ mb: 2, columnGap: { xs: 1.5, sm: 4 } }}>
        <Figure label="Statement total" value={formatINR(statementTotalPaise)} />
        <Figure label={`Entered (${transactionCount})`} value={formatINR(enteredTotalPaise)} />
        <Figure
          label="Difference"
          value={formatINR(difference)}
          color={difference === 0 ? 'success.main' : 'warning.main'}
        />
      </Stack>
      {transactionCount === 0 ? (
        <Alert severity="info">Add transactions from the statement to start reconciling this card.</Alert>
      ) : matched ? (
        <Alert severity="success">Transactions match the statement total.</Alert>
      ) : (
        <Alert severity="warning">
          {difference > 0
            ? `${formatINR(difference)} of the statement total is not yet accounted for.`
            : `Entered transactions exceed the statement total by ${formatINR(-difference)}.`}{' '}
          Check for missing, duplicated, or mistyped entries.
        </Alert>
      )}
    </Paper>
  );
}
