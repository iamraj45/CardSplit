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
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import ShareOutlined from '@mui/icons-material/ShareOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import ShareDialog from '../components/ShareDialog';
import { useSync } from '../features/sync/syncContext';
import { useCurrentUser } from '../features/user/currentUser';
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
import { loadSavedCards, notYetAdded } from '../features/cards/savedCards';
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
    access,
    canEdit,
  } = useOutletContext();
  const { user } = useCurrentUser();
  const { enabled: syncEnabled } = useSync();

  // Dialog state: { kind: 'details' | 'card' | 'adjustment' | 'import', target?, key }
  const [dialog, setDialog] = useState(null);
  const [cardToDelete, setCardToDelete] = useState(null);
  const [adjustmentToDelete, setAdjustmentToDelete] = useState(null);
  const [others, setOthers] = useState([]);
  const [savedCards, setSavedCards] = useState([]);

  useEffect(() => {
    storage.listReconciliations().then(setOthers).catch(() => setOthers([]));
  }, []);

  const status = STATUS_LABELS[rec.status] ?? STATUS_LABELS.draft;
  const open = (kind, target) => setDialog({ kind, target, key: Date.now() });
  const close = () => setDialog(null);
  const openNewCard = () => {
    loadSavedCards()
      .catch(() => [])
      .then((cards) => {
        setSavedCards(cards);
        open('card');
      });
  };
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
        <Stack direction="row" sx={{ alignItems: 'center', columnGap: 1, rowGap: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
            {rec.name}
          </Typography>
          <Chip size="small" label={status.label} color={status.color} />
          {access.role !== 'owner' && (
            <Chip size="small" variant="outlined" icon={<GroupOutlined />} label={`Shared by ${access.ownerName ?? 'someone'}`} />
          )}
          {!canEdit && <Chip size="small" variant="outlined" icon={<VisibilityOutlined />} label="View only" />}
          <SaveStatus status={saveStatus} />
        </Stack>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          {canEdit && (
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => open('details')} sx={headerButton}>
              Edit
            </Button>
          )}
          {syncEnabled && (
            <Button variant="outlined" startIcon={<ShareOutlined />} onClick={() => open('share')} sx={headerButton}>
              Share
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<DownloadOutlined />}
            onClick={() => saveNow().then(() => exportBackupFile(rec))}
            sx={headerButton}
          >
            Backup
          </Button>
          <Button
            variant="contained"
            startIcon={<AssessmentOutlined />}
            onClick={() => navigate('report')}
            sx={headerButton}
          >
            Report
          </Button>
        </Stack>
      </Stack>

      {rec.cards.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" sx={{ columnGap: { xs: 1.5, sm: 4 } }}>
            <SummaryFigure
              label={`Statements (${rec.cards.length})`}
              value={formatINR(statementGrandTotal(rec))}
            />
            <SummaryFigure label={`Entered (${rec.transactions.length})`} value={formatINR(sumPaise(rec.transactions))} />
            {rec.adjustments.length > 0 && (
              <SummaryFigure
                label={`Adjustments (${rec.adjustments.length})`}
                value={formatINR(sumPaise(rec.adjustments))}
              />
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
        {canEdit && (
          <Button variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => open('import')}>
            Import statement
          </Button>
        )}
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
              onEdit={canEdit ? () => open('card', card) : undefined}
              onDelete={canEdit ? () => setCardToDelete(card) : undefined}
            />
          </Grid>
        ))}
        {canEdit && (
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%', minHeight: 190, borderStyle: 'dashed', borderRadius: 3 }}>
              <CardActionArea
                onClick={openNewCard}
                sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, color: 'text.secondary' }}
              >
                <Add fontSize="large" />
                <Typography>Add credit card</Typography>
              </CardActionArea>
            </Card>
          </Grid>
        )}
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
        readOnly={!canEdit}
      />

      <AdjustmentsSection
        rec={rec}
        onAdd={() => open('adjustment')}
        onEdit={(a) => open('adjustment', a)}
        onDelete={setAdjustmentToDelete}
        readOnly={!canEdit}
      />

      {dialog?.kind === 'share' && (
        <ShareDialog
          key={dialog.key}
          open
          rec={rec}
          access={access}
          currentEmail={user?.email}
          onLeave={async () => {
            close();
            await storage.deleteReconciliation(rec.id); // for non-owners this leaves the share
            navigate('/');
          }}
          onClose={close}
        />
      )}

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
          savedCards={dialog.target ? [] : notYetAdded(savedCards, rec.cards)}
          existingCards={rec.cards}
          onSubmit={(fields) =>
            dialog.target
              ? updateCard(dialog.target.id, fields)
              : addCard({ gradientKey: nextGradientKey(rec.cards), ...fields })
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

// Header actions: side by side on larger screens, a 2×2 grid on phones.
const headerButton = { flex: { xs: '1 1 40%', sm: 'none' } };

function SummaryFigure({ label, value }) {
  return (
    <Box sx={{ minWidth: 0, flex: { xs: 1, sm: 'none' } }}>
      <Typography variant="caption" color="text.secondary" noWrap component="div">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '0.95rem', sm: '1.25rem' }, whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  );
}
