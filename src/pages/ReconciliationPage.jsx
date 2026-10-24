import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useOutletContext } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Add from '@mui/icons-material/Add';
import EditOutlined from '@mui/icons-material/EditOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import { exportBackupFile } from '../features/backups/backupActions';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import AdjustmentEditor from '../components/AdjustmentEditor';
import ChecksPanel from '../components/ChecksPanel';
import { runChecks } from '../services/calculations/checks';
import ImportStatementDialog from '../components/import/ImportStatementDialog';
import AdjustmentsSection from '../components/AdjustmentsSection';
import CardFormDialog from '../components/CardFormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import CreditCardTile from '../components/CreditCardTile';
import PeoplePanel from '../components/PeoplePanel';
import ReconciliationFormDialog from '../components/ReconciliationFormDialog';
import SaveStatus from '../components/SaveStatus';
import { STATUS_LABELS } from '../services/calculations/reconciliation';
import {
  cardDifference,
  cardStatus,
  cardTransactions,
  statementGrandTotal,
  sumPaise,
  unassignedItems,
} from '../services/calculations/totals';
import { storage } from '../services/storage';
import { nextGradientKey } from '../theme/cardGradients';
import { formatINR } from '../utils/currency';

export default function ReconciliationPage() {
  const navigate = useNavigate();
  const {
    rec,
    saveStatus,
    saveNow,
    savedPeople,
    updateDetails,
    addCard,
    updateCard,
    deleteCard,
    addTransactions,
    addPerson,
    renamePerson,
    removePerson,
    addAdjustment,
    updateAdjustment,
    deleteAdjustment,
  } = useOutletContext();

  // Dialog state: { kind: 'details' | 'card' | 'adjustment' | 'import', target?, key }
  const [dialog, setDialog] = useState(null);
  const [cardToDelete, setCardToDelete] = useState(null);
  const [adjustmentToDelete, setAdjustmentToDelete] = useState(null);
  const [others, setOthers] = useState([]);

  useEffect(() => {
    storage.listReconciliations().then(setOthers).catch(() => setOthers([]));
  }, []);

  const status = STATUS_LABELS[rec.status] ?? STATUS_LABELS.draft;
  const open = (kind, target) => setDialog({ kind, target, key: Date.now() });
  const close = () => setDialog(null);
  const unassignedTxns = unassignedItems(rec, rec.transactions);
  const unassignedAdjustments = unassignedItems(rec, rec.adjustments);

  return (
    <Stack spacing={3}>
      <Breadcrumbs>
        <Link component={RouterLink} to="/" underline="hover" color="inherit">
          Reconciliations
        </Link>
        <Typography color="text.primary">{rec.name}</Typography>
      </Breadcrumbs>

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {rec.name}
            </Typography>
            <Chip size="small" label={status.label} color={status.color} />
          </Stack>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <SaveStatus status={saveStatus} />
          <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => open('details')}>
            Edit
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlined />}
            onClick={() => saveNow().then(() => exportBackupFile(rec))}
          >
            Backup
          </Button>
          <Button variant="contained" startIcon={<AssessmentOutlined />} onClick={() => navigate('report')}>
            Report
          </Button>
        </Stack>
      </Stack>

      {rec.cards.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 4 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Statement totals ({rec.cards.length} card{rec.cards.length === 1 ? '' : 's'})
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {formatINR(statementGrandTotal(rec))}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Entered transactions ({rec.transactions.length})
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {formatINR(sumPaise(rec.transactions))}
              </Typography>
            </Box>
            {rec.adjustments.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  External adjustments ({rec.adjustments.length})
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {formatINR(sumPaise(rec.adjustments))}
                </Typography>
              </Box>
            )}
          </Stack>
          {(unassignedTxns.length > 0 || unassignedAdjustments.length > 0) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Not yet assigned to anyone:{' '}
              {[
                unassignedTxns.length > 0 &&
                  `${unassignedTxns.length} transaction${unassignedTxns.length === 1 ? '' : 's'} (${formatINR(sumPaise(unassignedTxns))})`,
                unassignedAdjustments.length > 0 &&
                  `${unassignedAdjustments.length} adjustment${unassignedAdjustments.length === 1 ? '' : 's'} (${formatINR(sumPaise(unassignedAdjustments))})`,
              ]
                .filter(Boolean)
                .join(' and ')}
              .
            </Alert>
          )}
        </Paper>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2">
          Cards
        </Typography>
        <Button variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => open('import')}>
          Import statement
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mt: '8px !important' }}>
        {rec.cards.map((card) => (
          <Grid key={card.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <CreditCardTile
              card={card}
              transactionCount={cardTransactions(rec, card.id).length}
              status={cardStatus(rec, card)}
              difference={cardDifference(rec, card)}
              unassignedCount={unassignedTxns.filter((t) => t.cardId === card.id).length}
              onOpen={() => navigate(`card/${card.id}`)}
              onEdit={() => open('card', card)}
              onDelete={() => setCardToDelete(card)}
            />
          </Grid>
        ))}
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Card variant="outlined" sx={{ height: '100%', minHeight: 190, borderStyle: 'dashed', borderRadius: 3 }}>
            <CardActionArea
              onClick={() => open('card')}
              sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, color: 'text.secondary' }}
            >
              <Add fontSize="large" />
              <Typography>Add credit card</Typography>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>

      {rec.cards.length > 0 && (
        <ChecksPanel checks={runChecks(rec)} collapsible onOpenCard={(cardId) => navigate(`card/${cardId}`)} />
      )}

      <PeoplePanel
        rec={rec}
        savedPeople={savedPeople}
        onAddPerson={addPerson}
        onRenamePerson={renamePerson}
        onRemovePerson={removePerson}
      />

      <AdjustmentsSection
        rec={rec}
        onAdd={() => open('adjustment')}
        onEdit={(a) => open('adjustment', a)}
        onDelete={setAdjustmentToDelete}
      />

      {dialog?.kind === 'import' && (
        <ImportStatementDialog
          key={dialog.key}
          open
          rec={rec}
          actions={{ addCard, updateCard, addTransactions }}
          onDone={(cardId) => {
            close();
            navigate(`card/${cardId}`);
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === 'adjustment' && (
        <AdjustmentEditor
          key={dialog.key}
          open
          initial={dialog.target}
          people={rec.people}
          savedPeople={savedPeople}
          onAddPerson={addPerson}
          onSubmit={(fields) => (dialog.target ? updateAdjustment(dialog.target.id, fields) : addAdjustment(fields))}
          onClose={close}
        />
      )}

      <ConfirmDialog
        open={Boolean(adjustmentToDelete)}
        title="Delete adjustment?"
        message={
          adjustmentToDelete &&
          `“${adjustmentToDelete.name}” (${formatINR(adjustmentToDelete.amountPaise)}) will be removed.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteAdjustment(adjustmentToDelete.id)}
        onClose={() => setAdjustmentToDelete(null)}
      />

      {dialog?.kind === 'details' && (
        <ReconciliationFormDialog
          key={dialog.key}
          open
          initial={rec}
          existing={others}
          onSubmit={updateDetails}
          onClose={close}
        />
      )}

      {dialog?.kind === 'card' && (
        <CardFormDialog
          key={dialog.key}
          open
          initial={dialog.target}
          defaultPeriod={{ start: rec.periodStart, end: rec.periodEnd }}
          onSubmit={(fields) =>
            dialog.target
              ? updateCard(dialog.target.id, fields)
              : addCard({ ...fields, gradientKey: nextGradientKey(rec.cards) })
          }
          onClose={close}
        />
      )}

      <ConfirmDialog
        open={Boolean(cardToDelete)}
        title="Delete card?"
        message={
          cardToDelete &&
          `“${cardToDelete.name} •••• ${cardToDelete.last4}” and its ${
            cardTransactions(rec, cardToDelete.id).length
          } transaction(s) will be removed from this reconciliation.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteCard(cardToDelete.id)}
        onClose={() => setCardToDelete(null)}
      />
    </Stack>
  );
}
