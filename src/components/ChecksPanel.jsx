import { useState } from 'react';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { SEVERITY } from '../services/calculations/checks';
import { formatINR } from '../utils/currency';

const ICONS = {
  [SEVERITY.ERROR]: <ErrorOutlined color="error" fontSize="small" />,
  [SEVERITY.WARNING]: <WarningAmberOutlined color="warning" fontSize="small" />,
  [SEVERITY.INFO]: <InfoOutlined color="info" fontSize="small" />,
};

/**
 * Reconciliation checks. Informational notes are collapsed by default (unless `expandNotes`),
 * and expanded automatically when printing.
 */
export default function ChecksPanel({ checks, onOpenCard, expandNotes = false, title = 'Checks' }) {
  const [showNotes, setShowNotes] = useState(expandNotes);
  const issues = checks.filter((c) => c.severity !== SEVERITY.INFO);
  const notes = checks.filter((c) => c.severity === SEVERITY.INFO);
  const visible = showNotes ? checks : issues;

  return (
    <Paper variant="outlined" sx={{ p: 2, breakInside: 'avoid' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {notes.length > 0 && !expandNotes && (
          <Button size="small" onClick={() => setShowNotes(!showNotes)} sx={{ displayPrint: 'none' }}>
            {showNotes ? 'Hide notes' : `Show ${notes.length} note${notes.length === 1 ? '' : 's'}`}
          </Button>
        )}
      </Stack>

      {issues.length === 0 && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
          <CheckCircleOutlined color="success" fontSize="small" />
          <Typography>All checks passed — every card matches its statement and everything is assigned.</Typography>
        </Stack>
      )}

      {visible.length > 0 && (
        <List dense disablePadding sx={{ mt: 1 }}>
          {visible.map((c) => {
            const amount = c.diffPaise ?? c.amountPaise;
            return (
              <ListItem
                key={c.id}
                disableGutters
                alignItems="flex-start"
                secondaryAction={
                  c.cardId && onOpenCard ? (
                    <Button size="small" onClick={() => onOpenCard(c.cardId)} sx={{ displayPrint: 'none' }}>
                      Open card
                    </Button>
                  ) : null
                }
                sx={{ pr: c.cardId && onOpenCard ? 12 : 0 }}
              >
                <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>{ICONS[c.severity]}</ListItemIcon>
                <ListItemText
                  primary={amount != null ? `${c.title} (${formatINR(amount)})` : c.title}
                  secondary={c.detail}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {/* Notes are always included on paper. */}
      {!showNotes && notes.length > 0 && (
        <List dense disablePadding sx={{ display: 'none', displayPrint: 'block' }}>
          {notes.map((c) => (
            <ListItem key={c.id} disableGutters>
              <ListItemIcon sx={{ minWidth: 32 }}>{ICONS[c.severity]}</ListItemIcon>
              <ListItemText primary={c.title} secondary={c.detail} />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
