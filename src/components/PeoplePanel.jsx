import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import EditOutlined from '@mui/icons-material/EditOutlined';
import PersonRemoveOutlined from '@mui/icons-material/PersonRemoveOutlined';
import PersonPicker from './PersonPicker';
import { consolidatedPersonTotals, isPersonUsed, sumPaise } from '../services/calculations/totals';
import { formatINR } from '../utils/currency';

const num = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
// The cards/adjustments breakdown is hidden on phones so the Total column stays visible.
const breakdown = { ...num, display: { xs: 'none', sm: 'table-cell' } };

/** People in this reconciliation with their consolidated totals across cards and adjustments. */
export default function PeoplePanel({ rec, savedPeople, onAddPerson, onRenamePerson, onRemovePerson }) {
  const [renaming, setRenaming] = useState(null);
  const { rows, unassignedCardsPaise, unassignedAdjustmentsPaise } = consolidatedPersonTotals(rec);
  const cardsTotal = sumPaise(rec.transactions);
  const adjustmentsTotal = sumPaise(rec.adjustments);
  const hasUnassigned = unassignedCardsPaise !== 0 || unassignedAdjustmentsPaise !== 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h2">
        People &amp; totals
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        What each person owes across all cards, plus external adjustments.
      </Typography>

      {rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          No people yet. Add the people who share these cards.
        </Typography>
      ) : (
        <TableContainer sx={{ mb: 2 }}>
          <Table size="small" sx={{ '& .MuiTableCell-root': { px: { xs: 1, sm: 2 } } }}>
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
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ person, cardsPaise, adjustmentsPaise, totalPaise }) => {
                const used = isPersonUsed(rec, person.id);
                return (
                  <TableRow key={person.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{person.name}</TableCell>
                    <TableCell align="right" sx={breakdown}>
                      {formatINR(cardsPaise)}
                    </TableCell>
                    <TableCell align="right" sx={breakdown}>
                      {formatINR(adjustmentsPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>
                      {formatINR(totalPaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', width: 1 }}>
                      <Tooltip title="Rename">
                        <IconButton size="small" onClick={() => setRenaming(person)} aria-label={`Rename ${person.name}`}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={used ? 'Assigned to items — reassign them first' : 'Remove from this reconciliation'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={used}
                            onClick={() => onRemovePerson(person.id)}
                            aria-label={`Remove ${person.name}`}
                          >
                            <PersonRemoveOutlined fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {hasUnassigned && (
                <TableRow>
                  <TableCell sx={{ color: 'warning.main', fontWeight: 500 }}>Unassigned</TableCell>
                  <TableCell align="right" sx={{ ...breakdown, color: 'warning.main' }}>
                    {formatINR(unassignedCardsPaise)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...breakdown, color: 'warning.main' }}>
                    {formatINR(unassignedAdjustmentsPaise)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...num, color: 'warning.main', fontWeight: 600 }}>
                    {formatINR(unassignedCardsPaise + unassignedAdjustmentsPaise)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                <TableCell align="right" sx={{ ...breakdown, fontWeight: 600 }}>
                  {formatINR(cardsTotal)}
                </TableCell>
                <TableCell align="right" sx={{ ...breakdown, fontWeight: 600 }}>
                  {formatINR(adjustmentsTotal)}
                </TableCell>
                <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>
                  {formatINR(cardsTotal + adjustmentsTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      <PersonPicker savedPeople={savedPeople} currentPeople={rec.people} onAdd={onAddPerson} />

      {renaming && (
        <RenameDialog
          key={renaming.id}
          person={renaming}
          otherNames={rec.people.filter((p) => p.id !== renaming.id).map((p) => p.name.toLowerCase())}
          onSubmit={(name) => onRenamePerson(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </Paper>
  );
}

function RenameDialog({ person, otherNames, onSubmit, onClose }) {
  const [name, setName] = useState(person.name);
  const trimmed = name.trim();
  const error = !trimmed ? 'Name is required' : otherNames.includes(trimmed.toLowerCase()) && 'Someone already has this name';

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (error) return;
          onSubmit(trimmed);
          onClose();
        }}
      >
        <DialogTitle>Rename person</DialogTitle>
        <DialogContent>
          <Stack sx={{ pt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={Boolean(error)}
              helperText={error || 'Also updates the saved name for future reconciliations'}
              autoFocus
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={Boolean(error)}>
            Save
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
