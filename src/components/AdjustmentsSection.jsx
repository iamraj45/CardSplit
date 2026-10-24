import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Add from '@mui/icons-material/Add';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import AllocationSummary from './AllocationSummary';
import { sumPaise } from '../services/calculations/totals';
import { formatINR } from '../utils/currency';
import { useIsPhone } from '../utils/useIsPhone';

const num = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

/** External adjustments: amounts outside card statements that only affect person totals. */
export default function AdjustmentsSection({ rec, onAdd, onEdit, onDelete }) {
  const { adjustments, people } = rec;
  const isPhone = useIsPhone();

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', columnGap: 2, rowGap: 1, mb: 2 }}
      >
        <div>
          <Typography variant="h6" component="h2">
            External adjustments
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Not part of any card statement — included in person totals only.
          </Typography>
        </div>
        <Button variant="outlined" startIcon={<Add />} onClick={onAdd}>
          Add adjustment
        </Button>
      </Stack>

      {adjustments.length === 0 ? (
        <Typography color="text.secondary">None yet. Add items like a trip or a loan that should be shared too.</Typography>
      ) : isPhone ? (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          {adjustments.map((a) => (
            <Stack key={a.id} direction="row" sx={{ alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider' }}>
              <ButtonBase
                onClick={() => onEdit(a)}
                aria-label={`Edit ${a.name}`}
                sx={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', px: 2, py: 1.5 }}
              >
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                  <Typography sx={{ fontWeight: 500, minWidth: 0 }} noWrap>
                    {a.name}
                  </Typography>
                  <Typography sx={{ ...num, fontWeight: 600 }}>{formatINR(a.amountPaise)}</Typography>
                </Stack>
                {a.note && (
                  <Typography variant="caption" color="text.secondary" component="div">
                    {a.note}
                  </Typography>
                )}
                <Box sx={{ mt: 0.5 }}>
                  <AllocationSummary item={a} people={people} />
                </Box>
              </ButtonBase>
              <IconButton onClick={() => onDelete(a)} aria-label={`Delete ${a.name}`} sx={{ mt: 1, mr: 0.5 }}>
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>Total ({adjustments.length})</Typography>
            <Typography sx={{ ...num, fontWeight: 600 }}>{formatINR(sumPaise(adjustments))}</Typography>
          </Stack>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {adjustments.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell>
                    {a.name}
                    {a.note && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {a.note}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <AllocationSummary item={a} people={people} onClick={() => onEdit(a)} />
                  </TableCell>
                  <TableCell align="right" sx={num}>
                    {formatINR(a.amountPaise)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', width: 1 }}>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => onEdit(a)} aria-label={`Edit ${a.name}`}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => onDelete(a)} aria-label={`Delete ${a.name}`}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
                  Total ({adjustments.length})
                </TableCell>
                <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>
                  {formatINR(sumPaise(adjustments))}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}
