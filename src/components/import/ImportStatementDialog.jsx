import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import ImportMappingStep from './ImportMappingStep';
import ImportReviewStep, { NEW_CARD } from './ImportReviewStep';
import { LAST4_PATTERN } from '../../features/model';
import { loadMapping, saveMapping } from '../../features/import/mappingMemory';
import { buildReviewRows, checkRow } from '../../features/import/reviewRows';
import { readCsvRows } from '../../services/import/csvImporter';
import { readWorkbookSheets } from '../../services/import/excelImporter';
import { PdfNoTextError, PdfPasswordError, importPdf } from '../../services/import/pdfImporter';
import { TXN_KIND } from '../../services/import/statementParser';
import { detectHeaderRow, guessMapping, headerSignature, mappingIsUsable, rowsToTransactions } from '../../services/import/tabular';
import { cardTransactions, sumPaise } from '../../services/calculations/totals';
import { SPLIT_METHODS } from '../../services/calculations/splitCalculations';
import { nextGradientKey } from '../../theme/cardGradients';
import { paiseToInput, rupeesToPaise } from '../../utils/currency';
import { isValidISODate } from '../../utils/dates';

const EMPTY_META = { cardName: null, last4: null, periodStart: null, periodEnd: null, totalDuePaise: null };

function fileKind(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.csv') || file.type === 'text/csv') return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
  return null;
}

function tabularSettings(sheets, sheetIndex, headerIndexOverride) {
  const rows = sheets[sheetIndex].rows;
  const headerIndex = headerIndexOverride ?? detectHeaderRow(rows);
  const remembered = loadMapping(headerSignature(rows[headerIndex] ?? []));
  return {
    sheets,
    sheetIndex,
    headerIndex,
    mapping: remembered?.mapping ?? guessMapping(rows[headerIndex] ?? []),
    monthFirst: remembered?.monthFirst ?? false,
    invertSigns: remembered?.invertSigns ?? false,
  };
}

/**
 * Import a statement (PDF, CSV or Excel) into a card: parse, review, then save.
 * Props: rec, fixedCardId (import into this card only), actions { addCard, updateCard, addTransactions },
 * onDone(cardId, count), onClose.
 */
export default function ImportStatementDialog({ open, rec, fixedCardId, actions, onDone, onClose }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [step, setStep] = useState('file'); // file | password | mapping | review
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null); // { name, kind, buffer }
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [tabular, setTabular] = useState(null);

  const [meta, setMeta] = useState(EMPTY_META);
  const [parsed, setParsed] = useState([]);
  const [rows, setRows] = useState([]);
  const [target, setTarget] = useState(fixedCardId ?? NEW_CARD);
  const [newCard, setNewCard] = useState({ name: '', last4: '', statementStart: '', statementEnd: '', total: '' });
  const [updateCardDetails, setUpdateCardDetails] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const existingFor = (cardId) => (cardId === NEW_CARD ? [] : cardTransactions(rec, cardId));

  const toReview = (transactions, detectedMeta) => {
    const m = { ...EMPTY_META, ...detectedMeta };
    const matching = m.last4 && rec.cards.find((c) => c.last4 === m.last4);
    const initialTarget = fixedCardId ?? matching?.id ?? (m.last4 || rec.cards.length === 0 ? NEW_CARD : rec.cards[0].id);
    const initialCard = rec.cards.find((c) => c.id === initialTarget);
    setMeta(m);
    setParsed(transactions);
    setTarget(initialTarget);
    setRows(buildReviewRows(transactions, existingFor(initialTarget)));
    setNewCard({
      name: m.cardName ?? '',
      last4: m.last4 ?? '',
      statementStart: m.periodStart ?? rec.periodStart,
      statementEnd: m.periodEnd ?? rec.periodEnd,
      total: m.totalDuePaise != null ? paiseToInput(m.totalDuePaise) : '',
    });
    setUpdateCardDetails(Boolean(initialCard && initialCard.statementTotalPaise === 0 && m.totalDuePaise != null));
    setStep('review');
  };

  const parsePdf = async (buffer, pwd) => {
    try {
      const result = await importPdf(buffer, pwd || undefined);
      if (result.transactions.length === 0) {
        setError(
          'No transactions were found in this PDF. If your bank offers a CSV or Excel download, try that instead.',
        );
        setStep('file');
        return;
      }
      toReview(result.transactions, result.meta);
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setPasswordError(err.incorrect ? 'That password is not correct.' : null);
        setStep('password');
      } else if (err instanceof PdfNoTextError) {
        setError(err.message);
        setStep('file');
      } else {
        console.error(err);
        setError('This PDF could not be read. It may be damaged or in an unsupported format.');
        setStep('file');
      }
    }
  };

  const handleFile = async (picked) => {
    if (!picked) return;
    const kind = fileKind(picked);
    setError(null);
    if (!kind) {
      setError('Unsupported file. Choose a PDF, CSV or Excel (.xlsx) statement.');
      return;
    }
    setBusy(true);
    try {
      if (kind === 'csv') {
        setFile({ name: picked.name, kind });
        setTabular(tabularSettings([{ name: picked.name, rows: await readCsvRows(picked) }], 0));
        setStep('mapping');
        return;
      }
      const buffer = await picked.arrayBuffer();
      setFile({ name: picked.name, kind, buffer });
      if (kind === 'pdf') {
        await parsePdf(buffer);
      } else {
        const sheets = await readWorkbookSheets(buffer);
        const firstUsable = sheets.findIndex((s) => mappingIsUsable(guessMapping(s.rows[detectHeaderRow(s.rows)] ?? [])));
        setTabular(tabularSettings(sheets, Math.max(0, firstUsable)));
        setStep('mapping');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'This file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    await parsePdf(file.buffer, password);
    setBusy(false);
  };

  // --- Mapping step ---
  const mappingPreview = useMemo(() => {
    if (!tabular) return null;
    const rowsForSheet = tabular.sheets[tabular.sheetIndex].rows;
    if (!mappingIsUsable(tabular.mapping)) {
      return { transactions: [], skipped: 0, error: 'Choose a Date column and either an Amount column or Debit/Credit columns.' };
    }
    const result = rowsToTransactions(rowsForSheet, tabular.headerIndex, tabular.mapping, tabular);
    return result.transactions.length ? result : { ...result, error: 'No rows with a valid date and amount were found.' };
  }, [tabular]);

  const changeTabular = (changes) => {
    if ('sheetIndex' in changes) setTabular(tabularSettings(tabular.sheets, changes.sheetIndex));
    else if ('headerIndex' in changes) setTabular(tabularSettings(tabular.sheets, tabular.sheetIndex, changes.headerIndex));
    else setTabular({ ...tabular, ...changes });
  };

  const continueFromMapping = () => {
    const header = tabular.sheets[tabular.sheetIndex].rows[tabular.headerIndex] ?? [];
    saveMapping(headerSignature(header), {
      mapping: tabular.mapping,
      monthFirst: tabular.monthFirst,
      invertSigns: tabular.invertSigns,
    });
    toReview(mappingPreview.transactions, EMPTY_META);
  };

  // --- Review step ---
  const rowChecks = useMemo(() => rows.map(checkRow), [rows]);
  const card = rec.cards.find((c) => c.id === target);

  const newCardTotal = rupeesToPaise(newCard.total);
  const newCardErrors =
    target === NEW_CARD
      ? {
          name: !newCard.name.trim() && 'Required',
          last4: !LAST4_PATTERN.test(newCard.last4) && 'Enter 4 digits',
          statementStart: !isValidISODate(newCard.statementStart) && 'Required',
          statementEnd: !isValidISODate(newCard.statementEnd)
            ? 'Required'
            : newCard.statementEnd < newCard.statementStart && 'Before start',
          total: newCardTotal == null && 'Enter the total due',
        }
      : {};

  const summary = useMemo(() => {
    const included = rows.map((r, i) => ({ r, c: rowChecks[i] })).filter(({ r }) => r.include);
    const includedPaise = included.reduce((s, { c }) => s + (c.amountPaise ?? 0), 0);
    const payments = rows.filter((r, i) => !r.include && r.kind === TXN_KIND.PAYMENT && rowChecks[i].amountPaise != null);
    const existingPaise = target === NEW_CARD ? 0 : sumPaise(cardTransactions(rec, target));
    let statementTotalPaise = null;
    if (target === NEW_CARD) statementTotalPaise = newCardTotal;
    else if (card) statementTotalPaise = updateCardDetails && meta.totalDuePaise != null ? meta.totalDuePaise : card.statementTotalPaise;
    return {
      includedCount: included.length,
      includedPaise,
      invalidCount: included.filter(({ c }) => c.errors.length > 0).length,
      excludedPayments: { count: payments.length, paise: payments.reduce((s, r) => s + rupeesToPaise(r.amountInput), 0) },
      statementTotalPaise,
      afterImportPaise: existingPaise + includedPaise,
    };
  }, [rows, rowChecks, target, rec, card, newCardTotal, updateCardDetails, meta.totalDuePaise]);

  const canImport =
    step === 'review' &&
    summary.includedCount > 0 &&
    summary.invalidCount === 0 &&
    !Object.values(newCardErrors).some(Boolean);

  const changeTarget = (value) => {
    setTarget(value);
    // Duplicate checks depend on the card, so rebuild the rows for the new target.
    setRows(buildReviewRows(parsed, existingFor(value)));
    const nextCard = rec.cards.find((c) => c.id === value);
    setUpdateCardDetails(Boolean(nextCard && nextCard.statementTotalPaise === 0 && meta.totalDuePaise != null));
  };

  const doImport = () => {
    let cardId = target;
    if (target === NEW_CARD) {
      cardId = actions.addCard({
        name: newCard.name.trim(),
        last4: newCard.last4,
        statementStart: newCard.statementStart,
        statementEnd: newCard.statementEnd,
        statementTotalPaise: newCardTotal,
        gradientKey: nextGradientKey(rec.cards),
      }).id;
    } else if (updateCardDetails) {
      actions.updateCard(cardId, {
        ...(meta.totalDuePaise != null && { statementTotalPaise: meta.totalDuePaise }),
        ...(meta.periodStart && { statementStart: meta.periodStart, statementEnd: meta.periodEnd }),
      });
    }
    const split = assignTo ? { method: SPLIT_METHODS.SINGLE, allocations: [{ personId: assignTo, value: null }] } : null;
    const list = rows
      .map((r, i) => ({ r, c: rowChecks[i] }))
      .filter(({ r }) => r.include)
      .map(({ r, c }) => ({
        cardId,
        date: r.date,
        expenseName: r.expenseName,
        amountPaise: c.amountPaise,
        originalDescription: r.description || null,
        split,
        source: `import:${file.kind}`,
      }));
    actions.addTransactions(list);
    onDone(cardId, list.length);
  };

  const title = {
    file: 'Import statement',
    password: 'Password required',
    mapping: 'Match columns',
    review: 'Review transactions',
  }[step];

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth={step === 'review' ? 'lg' : 'md'} fullWidth>
      <DialogTitle>
        {title}
        {file && step !== 'file' && (
          <Typography variant="body2" color="text.secondary" component="div">
            {file.name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {step === 'file' && (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box
              component="label"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                p: 5,
                border: 2,
                borderStyle: 'dashed',
                borderColor: dragOver ? 'primary.main' : 'divider',
                borderRadius: 3,
                cursor: busy ? 'progress' : 'pointer',
                textAlign: 'center',
                bgcolor: dragOver ? 'action.hover' : 'transparent',
              }}
            >
              <input
                type="file"
                hidden
                accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv"
                disabled={busy}
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
                data-testid="statement-file"
              />
              {busy ? <CircularProgress size={40} /> : <UploadFileOutlined sx={{ fontSize: 48, color: 'text.secondary' }} />}
              <Typography variant="h6">{busy ? 'Reading statement…' : 'Choose a statement file or drop it here'}</Typography>
              <Typography variant="body2" color="text.secondary">
                Text-based PDF, CSV or Excel (.xlsx). Scanned PDFs are not supported yet.
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              The file is read in your browser and never uploaded anywhere.
            </Typography>
          </Stack>
        )}

        {step === 'password' && (
          <Box component="form" id="pdf-password" onSubmit={unlock}>
            <Stack spacing={2}>
              <Typography variant="body2">
                This statement is password protected. Banks usually tell you the password format in the statement
                email (often part of your name and date of birth). The password is only used to open the file here.
              </Typography>
              <TextField
                type="password"
                label="PDF password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={Boolean(passwordError)}
                helperText={passwordError || ' '}
                autoFocus
                autoComplete="off"
                fullWidth
              />
            </Stack>
          </Box>
        )}

        {step === 'mapping' && tabular && (
          <ImportMappingStep tabular={tabular} onChange={changeTabular} preview={mappingPreview} />
        )}

        {step === 'review' && (
          <ImportReviewStep
            rec={rec}
            meta={meta}
            fixedCardId={fixedCardId}
            target={target}
            onTargetChange={changeTarget}
            newCard={newCard}
            onNewCardChange={(changes) => setNewCard({ ...newCard, ...changes })}
            newCardErrors={newCardErrors}
            updateCardDetails={updateCardDetails}
            onUpdateCardDetailsChange={setUpdateCardDetails}
            rows={rows}
            rowChecks={rowChecks}
            onRowChange={(i, changes) => setRows(rows.map((r, j) => (j === i ? { ...r, ...changes } : r)))}
            onToggleAll={(include) => setRows(rows.map((r) => ({ ...r, include })))}
            assignTo={assignTo}
            onAssignToChange={setAssignTo}
            summary={summary}
          />
        )}
      </DialogContent>
      <DialogActions>
        {step !== 'file' && (
          <Button
            onClick={() => {
              setStep('file');
              setError(null);
              setPassword('');
            }}
            sx={{ mr: 'auto' }}
          >
            Choose another file
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        {step === 'password' && (
          <Button type="submit" form="pdf-password" variant="contained" disabled={!password || busy}>
            Unlock
          </Button>
        )}
        {step === 'mapping' && (
          <Button variant="contained" onClick={continueFromMapping} disabled={Boolean(mappingPreview?.error)}>
            Continue
          </Button>
        )}
        {step === 'review' && (
          <Button variant="contained" onClick={doImport} disabled={!canImport}>
            Import {summary.includedCount} transaction{summary.includedCount === 1 ? '' : 's'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
