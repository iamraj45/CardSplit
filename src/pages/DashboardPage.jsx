import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Add from '@mui/icons-material/Add';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import UploadOutlined from '@mui/icons-material/UploadOutlined';
import Snackbar from '@mui/material/Snackbar';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportBackupDialog from '../components/ImportBackupDialog';
import ReconciliationFormDialog from '../components/ReconciliationFormDialog';
import { backupIsStale, exportBackupFile, getLastBackupAt } from '../features/backups/backupActions';
import { carryOverCards, loadSavedCards } from '../features/cards/savedCards';
import { createReconciliation } from '../features/model';
import { useCurrentUser, withMe } from '../features/user/currentUser';
import { useSync } from '../features/sync/syncContext';
import { onRecordsChanged } from '../services/storage/events';
import ExitToAppOutlined from '@mui/icons-material/ExitToAppOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import { STATUS_LABELS } from '../services/calculations/reconciliation';
import { storage } from '../services/storage';
import { formatDate, formatPeriod } from '../utils/dates';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { enabled: synced } = useSync();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(0); // non-zero = open; value is the dialog key
  const [savedCards, setSavedCards] = useState([]);
  const [toDelete, setToDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(0); // non-zero = open; value is the dialog key
  const [toast, setToast] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt);

  const exportAll = async () => {
    try {
      const count = await exportBackupFile();
      setLastBackupAt(getLastBackupAt());
      setToast(`Backup downloaded (${count} reconciliation${count === 1 ? '' : 's'})`);
    } catch (err) {
      console.error(err);
      setToast('Export failed — please try again.');
    }
  };

  const refresh = useCallback(() => {
    storage
      .listReconciliations()
      .then(setItems)
      .catch((err) => {
        console.error(err);
        setError('Could not read saved reconciliations from this browser.');
      });
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => onRecordsChanged(refresh), [refresh]); // sync brought in changes

  // Saved cards are read when the dialog opens, so they include cards added since the last visit.
  const openCreate = () => {
    loadSavedCards()
      .catch((err) => {
        console.error('Could not read saved cards', err);
        return [];
      })
      .then((cards) => {
        setSavedCards(cards);
        setCreateOpen(Date.now());
      });
  };

  const handleCreate = async ({ cards = [], ...fields }) => {
    const rec = withMe(createReconciliation(fields), user);
    rec.cards = carryOverCards(cards, fields);
    await storage.saveReconciliation(rec);
    navigate(`/r/${rec.id}`);
  };

  const handleDelete = async () => {
    await storage.deleteReconciliation(toDelete.id);
    refresh();
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            Reconciliations
          </Typography>
          <Typography color="text.secondary">One reconciliation per billing period.</Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<UploadOutlined />}
            onClick={() => setImportOpen(Date.now())}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Import backup
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadOutlined />}
            onClick={exportAll}
            disabled={!items?.length}
            sx={{ flex: { xs: 1, sm: 'none' } }}
          >
            Export backup
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openCreate}
            sx={{ flexBasis: { xs: '100%', sm: 'auto' }, order: { xs: -1, sm: 0 } }}
          >
            New reconciliation
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!synced && items?.length > 0 && backupIsStale(lastBackupAt) && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={exportAll}>
              Export now
            </Button>
          }
        >
          {lastBackupAt
            ? `Your last backup was on ${formatDate(lastBackupAt.slice(0, 10))}.`
            : 'You haven’t made a backup on this device yet.'}{' '}
          Data lives only in this browser — clearing site data deletes it.
        </Alert>
      )}

      {!items && !error && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {items?.length === 0 && (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}>
          <ReceiptLongOutlined sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="h6">No reconciliations yet</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create one for a billing period, then add your credit cards and transactions.
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            New reconciliation
          </Button>
        </Paper>
      )}

      {items?.length > 0 && (
        <Grid container spacing={2}>
          {items.map((r) => {
            const status = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft;
            return (
              <Grid key={r.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ position: 'relative', height: '100%' }}>
                  <CardActionArea onClick={() => navigate(`/r/${r.id}`)} sx={{ p: 2, height: '100%' }}>
                    <Typography variant="h6" sx={{ pr: 5, fontWeight: 600 }}>
                      {r.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {formatPeriod(r.periodStart, r.periodEnd) !== r.name &&
                        `${formatPeriod(r.periodStart, r.periodEnd)} · `}
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                      <Chip size="small" label={status.label} color={status.color} />
                      {r.role && r.role !== 'owner' ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          icon={<GroupOutlined />}
                          label={`${r.role === 'viewer' ? 'View only · ' : ''}Shared by ${r.ownerName ?? 'someone'}`}
                        />
                      ) : (
                        r.shared && <Chip size="small" variant="outlined" icon={<GroupOutlined />} label="Shared" />
                      )}
                      <Typography variant="body2" color="text.secondary">
                        {r.cardCount} card{r.cardCount === 1 ? '' : 's'} · {r.transactionCount} transaction
                        {r.transactionCount === 1 ? '' : 's'}
                      </Typography>
                    </Stack>
                  </CardActionArea>
                  <Tooltip title={r.role && r.role !== 'owner' ? 'Leave' : 'Delete'}>
                    <IconButton
                      size="small"
                      onClick={() => setToDelete(r)}
                      sx={{ position: 'absolute', top: 8, right: 8 }}
                      aria-label={`${r.role && r.role !== 'owner' ? 'Leave' : 'Delete'} ${r.name}`}
                    >
                      {r.role && r.role !== 'owner' ? <ExitToAppOutlined fontSize="small" /> : <DeleteOutlined fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {synced ? (
        <Alert severity="info" variant="outlined">
          Signed in as {user.email}. Your reconciliations sync to your account and work offline — changes made
          without a connection sync when you are back online.
        </Alert>
      ) : (
        <Alert severity="info" variant="outlined">
          Your data is saved only in this browser on this device — it is not synced. To move it to another device, use
          Export backup here and Import backup there.
          {lastBackupAt && !backupIsStale(lastBackupAt) && ` Last backup: ${formatDate(lastBackupAt.slice(0, 10))}.`}
        </Alert>
      )}

      {importOpen !== 0 && (
        <ImportBackupDialog
          key={importOpen}
          open
          existing={items ?? []}
          onDone={({ added, replaced, copied, skipped }) => {
            setImportOpen(0);
            refresh();
            const parts = [
              added && `${added} added`,
              replaced && `${replaced} replaced`,
              copied && `${copied} copied`,
              skipped && `${skipped} skipped`,
            ].filter(Boolean);
            setToast(`Backup imported: ${parts.join(', ')}`);
          }}
          onClose={() => setImportOpen(0)}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {createOpen !== 0 && (
        <ReconciliationFormDialog
          key={createOpen}
          open
          existing={items ?? []}
          savedCards={savedCards}
          onSubmit={handleCreate}
          onClose={() => setCreateOpen(0)}
        />
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={toDelete?.role && toDelete.role !== 'owner' ? 'Leave shared reconciliation?' : 'Delete reconciliation?'}
        message={
          !toDelete
            ? ''
            : toDelete.role && toDelete.role !== 'owner'
              ? `You will no longer see “${toDelete.name}”. ${toDelete.ownerName ?? 'The owner'} can invite you again.`
              : `“${toDelete.name}” and all of its ${toDelete.cardCount} card(s) and ${toDelete.transactionCount} transaction(s) will be permanently deleted${
                  synced ? ' for everyone it is shared with, on all devices.' : ' from this browser.'
                }`
        }
        confirmLabel={toDelete?.role && toDelete.role !== 'owner' ? 'Leave' : 'Delete'}
        destructive
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </Stack>
  );
}
