import { useState } from 'react';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { SEVERITY } from '../services/calculations/checks';
import { formatINR } from '../utils/currency';

const ICONS = {
  [SEVERITY.ERROR]: <ErrorOutlined color="error" fontSize="small" />,
  [SEVERITY.WARNING]: <WarningAmberOutlined color="warning" fontSize="small" />,
  [SEVERITY.INFO]: <InfoOutlined color="info" fontSize="small" />,
};

const COLLAPSED_KEY = 'ccr.checksCollapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // per-device convenience only
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Reconciliation checks. With `collapsible`, the whole panel folds down to its header and a
 * summary; the choice is remembered on this device. Informational notes are hidden behind a
 * toggle on screen and always printed.
 */
export default function ChecksPanel({ checks, onOpenCard, collapsible = false, title = 'Checks' }) {
  const [showNotes, setShowNotes] = useState(false);
  const [collapsed, setCollapsed] = useState(() => collapsible && readCollapsed());
  const issues = checks.filter((c) => c.severity !== SEVERITY.INFO);
  const errors = issues.filter((c) => c.severity === SEVERITY.ERROR);
  const notes = checks.filter((c) => c.severity === SEVERITY.INFO);
  const visible = showNotes ? checks : issues;

  const toggle = () => {
    setCollapsed(!collapsed);
    writeCollapsed(!collapsed);
  };

  const summary = (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {issues.length === 0 ? (
        <Chip size="small" color="success" variant="outlined" label="All passed" />
      ) : (
        <Chip size="small" color={errors.length ? 'error' : 'warning'} variant="outlined" label={plural(issues.length, 'issue')} />
      )}
      {notes.length > 0 && <Chip size="small" variant="outlined" label={plural(notes.length, 'note')} />}
    </Stack>
  );

  const heading = (
    <Typography variant="h6" component="h2">
      {title}
    </Typography>
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, breakInside: 'avoid' }}>
      {collapsible ? (
        <ButtonBase
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={`${title}: ${collapsed ? 'expand' : 'collapse'}`}
          disableRipple
          sx={{
            width: '100%',
            justifyContent: 'space-between',
            gap: 2,
            borderRadius: 1,
            textAlign: 'left',
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 4 },
          }}
        >
          <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            {heading}
            {summary}
          </Stack>
          <ExpandMore sx={{ transition: 'transform 150ms', transform: collapsed ? 'none' : 'rotate(180deg)' }} />
        </ButtonBase>
      ) : (
        heading
      )}

      <Collapse in={!collapsed} unmountOnExit>
        {issues.length === 0 && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
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

        {notes.length > 0 && (
          <Button size="small" onClick={() => setShowNotes(!showNotes)} sx={{ mt: 1, displayPrint: 'none' }}>
            {showNotes ? 'Hide notes' : `Show ${plural(notes.length, 'note')}`}
          </Button>
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
      </Collapse>
    </Paper>
  );
}
