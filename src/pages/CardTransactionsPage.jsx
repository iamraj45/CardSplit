import { useMemo, useState } from 'react';
import { Link as RouterLink, useOutletContext, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Add from '@mui/icons-material/Add';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import AllocationSummary from '../components/AllocationSummary';
import ImportStatementDialog from '../components/import/ImportStatementDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import CreditCardTile from '../components/CreditCardTile';
import ExpenseEditor from '../components/ExpenseEditor';
import ReconciliationStatus from '../components/ReconciliationStatus';
import SaveStatus from '../components/SaveStatus';
import { reusableSplit } from '../features/splits/splitDraft';
import {
  cardDifference,
  cardPersonTotals,
  cardStatus,
  cardTransactions,
  sumPaise,
  unassignedItems,
} from '../services/calculations/totals';
import { formatINR } from '../utils/currency';
import { formatDate } from '../utils/dates';
import { useIsPhone } from '../utils/useIsPhone';

const num = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

export default function CardTransactionsPage() {
  const { cardId } = useParams();
  const {
    rec,
    saveStatus,
    savedPeople,
    addPerson,
    addCard,
    updateCard,
    addTransaction,
    addTransactions,
    updateTransaction,
    deleteTransaction,
  } = useOutletContext();
  const card = rec.cards.find((c) => c.id === cardId);

  // Editor state: { txn?, key }
  const [editor, setEditor] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [importKey, setImportKey] = useState(0); // non-zero = import dialog open
  const isPhone = useIsPhone(); // phones get a list instead of the table

  const transactions = useMemo(
    () => (card ? cardTransactions(rec, card.id).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [rec, card],
  );

  if (!card) {
    return (
      <Alert
        severity="warning"
        action={
          <Button component={RouterLink} to=".." relative="path" color="inherit" size="small">
            Back
          </Button>
        }
      >
        This card no longer exists in this reconciliation.
      </Alert>
    );
  }

  const enteredTotal = sumPaise(transactions);
  const lastDate = transactions.at(-1)?.date ?? card.statementStart;
  // Pre-fill new entries with the split of the most recently added transaction on this card.
  const lastSplit = reusableSplit(cardTransactions(rec, card.id).at(-1)?.split ?? null);
  const unassigned = unassignedItems(rec, transactions);
  const unassignedIds = new Set(unassigned.map((t) => t.id));
  const visible = unassignedOnly && unassigned.length > 0 ? transactions.filter((t) => unassignedIds.has(t.id)) : transactions;
  const split = cardPersonTotals(rec, card.id);

  return (
    <Stack spacing={3}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/" underline="hover" color="inherit">
          Reconciliations
        </Link>
        <Link component={RouterLink} to={`/r/${rec.id}`} underline="hover" color="inherit">
          {rec.name}
        </Link>
        <Typography color="text.primary">{card.name}</Typography>
      </Breadcrumbs>

      <Grid container spacing={2} sx={{ alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <CreditCardTile
            card={card}
            transactionCount={transactions.length}
            status={cardStatus(rec, card)}
            difference={cardDifference(rec, card)}
            unassignedCount={unassigned.length}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <ReconciliationStatus
            statementTotalPaise={card.statementTotalPaise}
            enteredTotalPaise={enteredTotal}
            transactionCount={transactions.length}
          />
        </Grid>
      </Grid>

      {transactions.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Split for this card
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {rec.people
              .filter((p) => split.byPerson.has(p.id))
              .map((p) => (
                <Chip key={p.id} label={`${p.name}: ${formatINR(split.byPerson.get(p.id))}`} />
              ))}
            {split.unassignedPaise !== 0 || unassigned.length > 0 ? (
              <Chip
                color="warning"
                variant="outlined"
                label={`Unassigned: ${formatINR(split.unassignedPaise)} (${unassigned.length})`}
              />
            ) : (
              <Chip color="success" variant="outlined" label="All transactions assigned" />
            )}
          </Stack>
        </Paper>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography variant="h6" component="h2">
            Transactions
          </Typography>
          {unassigned.length > 0 && (
            <FormControlLabel
              control={<Switch size="small" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />}
              label={`Unassigned only (${unassigned.length})`}
            />
          )}
        </Stack>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <SaveStatus status={saveStatus} />
          </Box>
          <Button
            variant="outlined"
            startIcon={<UploadFileOutlined />}
            onClick={() => setImportKey(Date.now())}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Import
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setEditor({ key: Date.now() })}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Add transaction
          </Button>
        </Stack>
      </Stack>

      {transactions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            No transactions yet. Add each line from the statement — refunds and credits as negative amounts.
          </Typography>
        </Paper>
      ) : isPhone ? (
        <Paper variant="outlined">
          {visible.map((t) => (
            <Stack key={t.id} direction="row" sx={{ alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider' }}>
              <ButtonBase
                onClick={() => setEditor({ txn: t, key: Date.now() })}
                aria-label={`Edit ${t.expenseName}`}
                sx={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', px: 2, py: 1.5 }}
              >
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                  <Typography sx={{ fontWeight: 500, minWidth: 0 }} noWrap>
                    {t.expenseName}
                  </Typography>
                  <Typography sx={{ ...num, fontWeight: 600, color: t.amountPaise < 0 ? 'success.main' : undefined }}>
                    {formatINR(t.amountPaise)}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" component="div">
                  {formatDate(t.date)}
                  {t.amountPaise < 0 ? ' · Credit' : ''}
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <AllocationSummary item={t} people={rec.people} />
                </Box>
              </ButtonBase>
              <IconButton onClick={() => setToDelete(t)} aria-label={`Delete ${t.expenseName}`} sx={{ mt: 1, mr: 0.5 }}>
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {visible === transactions ? `Total (${transactions.length})` : `Unassigned total (${visible.length})`}
            </Typography>
            <Typography sx={{ ...num, fontWeight: 600 }}>{formatINR(sumPaise(visible))}</Typography>
          </Stack>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Date</TableCell>
                <TableCell>Expense name</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Box component="span" sx={visuallyHidden}>
                    Actions
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</TableCell>
                  <TableCell>
                    {t.expenseName}
                    {t.amountPaise < 0 && <Chip size="small" label="Credit" color="success" variant="outlined" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>
                    <AllocationSummary item={t} people={rec.people} onClick={() => setEditor({ txn: t, key: Date.now() })} />
                  </TableCell>
                  <TableCell align="right" sx={{ ...num, color: t.amountPaise < 0 ? 'success.main' : undefined }}>
                    {formatINR(t.amountPaise)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => setEditor({ txn: t, key: Date.now() })}
                        aria-label={`Edit ${t.expenseName}`}
                      >
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => setToDelete(t)} aria-label={`Delete ${t.expenseName}`}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} sx={{ fontWeight: 600 }}>
                  {visible === transactions ? `Total (${transactions.length})` : `Unassigned total (${visible.length})`}
                </TableCell>
                <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>
                  {formatINR(sumPaise(visible))}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      {importKey !== 0 && (
        <ImportStatementDialog
          key={importKey}
          open
          rec={rec}
          fixedCardId={card.id}
          actions={{ addCard, updateCard, addTransactions }}
          onDone={() => setImportKey(0)}
          onClose={() => setImportKey(0)}
        />
      )}

      {editor && (
        <ExpenseEditor
          key={editor.key}
          open
          initial={editor.txn}
          card={card}
          defaultDate={lastDate}
          defaultSplit={lastSplit}
          people={rec.people}
          savedPeople={savedPeople}
          onAddPerson={addPerson}
          onSubmit={(fields) =>
            editor.txn ? updateTransaction(editor.txn.id, fields) : addTransaction({ ...fields, cardId: card.id })
          }
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete transaction?"
        message={toDelete && `“${toDelete.expenseName}” (${formatINR(toDelete.amountPaise)}) will be removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTransaction(toDelete.id)}
        onClose={() => setToDelete(null)}
      />
    </Stack>
  );
}

const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: 1,
};
