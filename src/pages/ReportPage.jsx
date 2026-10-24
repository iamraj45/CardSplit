import { Fragment, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useOutletContext } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import ChecksPanel from '../components/ChecksPanel';
import { buildReport } from '../features/reports/buildReport';
import { buildReportText } from '../features/reports/reportText';
import { RECONCILIATION_STATUS } from '../features/model';
import { formatINR } from '../utils/currency';
import { formatDate, todayISO } from '../utils/dates';

const num = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const inr = (paise) => formatINR(paise, { compact: true });
// Cards/adjustments breakdown columns: hidden on phones (Total stays visible), always printed.
const breakdown = { ...num, display: { xs: 'none', sm: 'table-cell' }, '@media print': { display: 'table-cell' } };

const STATUS_COLOR = {
  [RECONCILIATION_STATUS.RECONCILED]: 'success',
  [RECONCILIATION_STATUS.NEEDS_REVIEW]: 'warning',
  [RECONCILIATION_STATUS.DRAFT]: 'default',
};

export default function ReportPage() {
  const navigate = useNavigate();
  const { rec, updateDetails } = useOutletContext();
  const report = useMemo(() => buildReport(rec), [rec]);
  const itemised = rec.reportSettings?.itemised ?? true;
  const text = useMemo(() => buildReportText(report, { itemised }), [report, itemised]);

  const [toast, setToast] = useState(null);
  const [manualCopy, setManualCopy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Report copied as text');
    } catch {
      setManualCopy(true); // clipboard blocked (e.g. insecure context) — let the user copy by hand
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: report.name, text });
    } catch (err) {
      if (err?.name !== 'AbortError') setManualCopy(true);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={2} sx={{ displayPrint: 'none' }}>
        <Breadcrumbs>
          <Link component={RouterLink} to="/" underline="hover" color="inherit">
            Reconciliations
          </Link>
          <Link component={RouterLink} to={`/r/${rec.id}`} underline="hover" color="inherit">
            {rec.name}
          </Link>
          <Typography color="text.primary">Report</Typography>
        </Breadcrumbs>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={
              <Switch
                checked={itemised}
                onChange={(e) => updateDetails({ reportSettings: { ...rec.reportSettings, itemised: e.target.checked } })}
              />
            }
            label="Show items"
            sx={{ mr: 'auto' }}
          />
          {canShare && (
            <Button startIcon={<ShareOutlined />} onClick={share}>
              Share
            </Button>
          )}
          <Button startIcon={<ContentCopyOutlined />} onClick={copy}>
            Copy text
          </Button>
          <Button variant="contained" startIcon={<PrintOutlined />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          To save a PDF, choose “Save as PDF” as the printer. A PDF is for sharing — keep a JSON backup to restore editable
          data.
        </Typography>
      </Stack>

      <Paper
        variant="outlined"
        className="print-plain"
        sx={{ p: { xs: 2, sm: 4 }, '@media print': { border: 'none', p: 0 } }}
      >
        {/* Header */}
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {report.name}
            </Typography>
            <Typography color="text.secondary">
              {formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · Generated {formatDate(todayISO())}
            </Typography>
          </Box>
          <Chip label={report.statusLabel} color={STATUS_COLOR[report.status] ?? 'default'} />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 5 }} sx={{ my: 3 }}>
          <Figure label={`Card statements (${report.cards.length})`} value={inr(report.cards.reduce((s, c) => s + c.statementTotalPaise, 0))} />
          <Figure label={`External adjustments (${report.adjustments.length})`} value={inr(report.adjustmentsTotalPaise)} />
          <Figure label="Total to settle" value={inr(report.grandTotalPaise)} strong />
        </Stack>

        {report.cards.length === 0 && <Alert severity="info">No cards in this reconciliation yet.</Alert>}

        {/* Card sections */}
        {report.cards.map((c) => (
          <Box key={c.card.id} component="section" sx={{ mb: 4, breakInside: 'avoid' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="h6" component="h2">
                {c.card.name} •••• {c.card.last4}
              </Typography>
              <Typography sx={{ ...num, fontWeight: 600 }}>Statement {inr(c.statementTotalPaise)}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {formatDate(c.card.statementStart)} – {formatDate(c.card.statementEnd)} · {c.transactionCount} transaction
              {c.transactionCount === 1 ? '' : 's'}
            </Typography>
            <Table size="small">
              <TableBody>
                {c.persons.map((p) => (
                  <Fragment key={p.person.id}>
                    <TableRow>
                      <TableCell colSpan={1} sx={{ fontWeight: 600, borderBottom: itemised ? 'none' : undefined }}>
                        {p.person.name}
                      </TableCell>
                      <TableCell align="right" sx={{ ...num, fontWeight: 600, borderBottom: itemised ? 'none' : undefined }}>
                        {inr(p.totalPaise)}
                      </TableCell>
                    </TableRow>
                    {itemised &&
                      p.items.map((item, i) => {
                        const border = i === p.items.length - 1 ? undefined : 'none';
                        return (
                          <TableRow key={`${item.id}-${i}`}>
                            <TableCell sx={{ color: 'text.secondary', borderBottom: border, pl: { xs: 3, sm: 5 } }}>
                              {item.name}
                              <Typography variant="caption" component="div" color="text.secondary">
                                {formatDate(item.date)}
                                {item.detail && ` · ${item.detail}`}
                              </Typography>
                            </TableCell>
                            <TableCell align="right" sx={{ ...num, color: 'text.secondary', borderBottom: border }}>
                              {inr(item.sharePaise)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </Fragment>
                ))}
                {c.unassigned.items.length > 0 && (
                  <TableRow>
                    <TableCell colSpan={1} sx={{ color: 'warning.main', fontWeight: 600 }}>
                      Unassigned
                      {itemised && (
                        <Typography variant="body2" component="span" sx={{ fontWeight: 400 }}>
                          {' '}
                          — {c.unassigned.items.map((t) => t.expenseName).join(', ')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ ...num, color: 'warning.main', fontWeight: 600 }}>
                      {inr(c.unassigned.totalPaise)}
                    </TableCell>
                  </TableRow>
                )}
                {c.transactionCount === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>
                      No transactions entered.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={1} sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Entered total
                  </TableCell>
                  <TableCell align="right" sx={{ ...num, fontWeight: 600, color: 'text.primary' }}>
                    {inr(c.enteredPaise)}
                  </TableCell>
                </TableRow>
                {c.transactionCount > 0 && c.differencePaise !== 0 && (
                  <TableRow>
                    <TableCell colSpan={1} sx={{ color: 'warning.main', fontWeight: 600 }}>
                      Difference from statement
                    </TableCell>
                    <TableCell align="right" sx={{ ...num, color: 'warning.main', fontWeight: 600 }}>
                      {inr(c.differencePaise)}
                    </TableCell>
                  </TableRow>
                )}
              </TableFooter>
            </Table>
          </Box>
        ))}

        {/* External adjustments */}
        {report.adjustments.length > 0 && (
          <Box component="section" sx={{ mb: 4, breakInside: 'avoid' }}>
            <Typography variant="h6" component="h2">
              External adjustments
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Not part of any card statement.
            </Typography>
            <Table size="small">
              <TableBody>
                {report.adjustments.map(({ adjustment, assigned, shares }) => (
                  <TableRow key={adjustment.id}>
                    <TableCell>
                      {adjustment.name}
                      {adjustment.note && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {adjustment.note}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ color: assigned ? 'text.secondary' : 'warning.main' }}>
                      {!assigned
                        ? 'Unassigned'
                        : shares.length === 1
                          ? shares[0].name
                          : shares.map((s) => `${s.name} ${inr(s.paise)}`).join(' · ')}
                    </TableCell>
                    <TableCell align="right" sx={num}>
                      {inr(adjustment.amountPaise)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} sx={{ fontWeight: 600, color: 'text.primary' }}>
                    Total
                  </TableCell>
                  <TableCell align="right" sx={{ ...num, fontWeight: 600, color: 'text.primary' }}>
                    {inr(report.adjustmentsTotalPaise)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Box>
        )}

        {/* Consolidated totals */}
        <Box component="section" sx={{ mb: 4, breakInside: 'avoid' }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            Consolidated totals
          </Typography>
          {report.consolidated.rows.length === 0 ? (
            <Typography color="text.secondary">No people added yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell align="right" sx={breakdown}>
                    Cards
                  </TableCell>
                  <TableCell align="right" sx={breakdown}>
                    Adjustments
                  </TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.consolidated.rows.map((r) => (
                  <TableRow key={r.person.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{r.person.name}</TableCell>
                    <TableCell align="right" sx={breakdown}>
                      {inr(r.cardsPaise)}
                    </TableCell>
                    <TableCell align="right" sx={breakdown}>
                      {inr(r.adjustmentsPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...num, fontWeight: 700 }}>
                      {inr(r.totalPaise)}
                    </TableCell>
                  </TableRow>
                ))}
                {report.consolidated.unassignedCardsPaise + report.consolidated.unassignedAdjustmentsPaise !== 0 && (
                  <TableRow>
                    <TableCell sx={{ color: 'warning.main', fontWeight: 600 }}>Unassigned</TableCell>
                    <TableCell align="right" sx={{ ...breakdown, color: 'warning.main' }}>
                      {inr(report.consolidated.unassignedCardsPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...breakdown, color: 'warning.main' }}>
                      {inr(report.consolidated.unassignedAdjustmentsPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...num, color: 'warning.main', fontWeight: 700 }}>
                      {inr(report.consolidated.unassignedCardsPaise + report.consolidated.unassignedAdjustmentsPaise)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>Total</TableCell>
                  <TableCell align="right" sx={{ ...breakdown, fontWeight: 700, color: 'text.primary' }}>
                    {inr(report.grandTotalPaise - report.adjustmentsTotalPaise)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...breakdown, fontWeight: 700, color: 'text.primary' }}>
                    {inr(report.adjustmentsTotalPaise)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...num, fontWeight: 700, color: 'text.primary' }}>
                    {inr(report.grandTotalPaise)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </Box>

        <Divider sx={{ mb: 3 }} />

        <ChecksPanel
          title={`Reconciliation status: ${report.statusLabel}`}
          checks={report.checks}
          onOpenCard={(cardId) => navigate(`/r/${rec.id}/card/${cardId}`)}
        />
      </Paper>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={2500}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ displayPrint: 'none' }}
      />

      <Dialog open={manualCopy} onClose={() => setManualCopy(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Copy report text</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Your browser blocked automatic copying. Select the text below and copy it.
          </Typography>
          <TextField
            value={text}
            multiline
            fullWidth
            minRows={10}
            slotProps={{ htmlInput: { readOnly: true, onFocus: (e) => e.target.select() } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualCopy(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Figure({ label, value, strong }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: strong ? 700 : 600, ...num }}>
        {value}
      </Typography>
    </Box>
  );
}
