import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
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
import Typography from '@mui/material/Typography';
import { formatINR } from '../../utils/currency';
import { formatDate } from '../../utils/dates';

const ROLE_LABELS = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount (one column)',
  drcr: 'Dr / Cr column',
  debit: 'Debit column',
  credit: 'Credit column',
};

const cellLabel = (cell, i) => {
  const text = cell == null ? '' : String(cell).trim();
  return text ? `${text}` : `Column ${i + 1}`;
};

/** Pick the sheet, header row and columns for a CSV/Excel statement, with a live preview. */
export default function ImportMappingStep({ tabular, onChange, preview }) {
  const { sheets, sheetIndex, headerIndex, mapping, monthFirst, invertSigns } = tabular;
  const rows = sheets[sheetIndex].rows;
  const headerCells = rows[headerIndex] ?? [];
  const setRole = (role, value) => onChange({ mapping: { ...mapping, [role]: value === '' ? null : Number(value) } });

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Tell us which columns hold the date, description and amount. Your choices are remembered for files with the
        same columns.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {sheets.length > 1 && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="map-sheet">Sheet</InputLabel>
            <Select labelId="map-sheet" label="Sheet" value={sheetIndex} onChange={(e) => onChange({ sheetIndex: e.target.value })}>
              {sheets.map((s, i) => (
                <MenuItem key={s.name} value={i}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl size="small" sx={{ minWidth: 260, maxWidth: '100%' }}>
          <InputLabel id="map-header">Header row</InputLabel>
          <Select
            labelId="map-header"
            label="Header row"
            value={headerIndex}
            onChange={(e) => onChange({ headerIndex: e.target.value })}
          >
            {rows.slice(0, 25).map((row, i) => (
              <MenuItem key={i} value={i} sx={{ maxWidth: 480 }}>
                <Typography noWrap variant="body2">
                  Row {i + 1}: {row.filter((c) => String(c).trim()).slice(0, 5).join(' | ') || '(empty)'}
                </Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={2}>
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <Grid key={role} size={{ xs: 12, sm: 6, md: 4 }}>
            <FormControl size="small" fullWidth>
              <InputLabel id={`map-${role}`}>{label}</InputLabel>
              <Select
                labelId={`map-${role}`}
                label={label}
                value={mapping[role] ?? ''}
                onChange={(e) => setRole(role, e.target.value)}
              >
                <MenuItem value="">
                  <em>Not used</em>
                </MenuItem>
                {headerCells.map((cell, i) => (
                  <MenuItem key={i} value={i}>
                    {cellLabel(cell, i)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        ))}
      </Grid>

      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ columnGap: 3 }}>
        <FormControlLabel
          control={<Checkbox checked={monthFirst} onChange={(e) => onChange({ monthFirst: e.target.checked })} />}
          label="Dates are month first (MM/DD/YYYY)"
        />
        <FormControlLabel
          control={<Checkbox checked={invertSigns} onChange={(e) => onChange({ invertSigns: e.target.checked })} />}
          label="Spends are shown as negative numbers"
        />
      </Stack>

      {preview.error ? (
        <Alert severity="warning">{preview.error}</Alert>
      ) : (
        <>
          <Typography variant="body2">
            Found <strong>{preview.transactions.length}</strong> transaction(s)
            {preview.skipped > 0 ? `; ${preview.skipped} row(s) without a valid date or amount will be skipped` : ''}.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.transactions.slice(0, 6).map((t, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatINR(t.amountPaise)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary">
            Charges should be positive and refunds/payments negative. If they are the wrong way round, tick “Spends are
            shown as negative numbers”.
          </Typography>
        </>
      )}
    </Stack>
  );
}
