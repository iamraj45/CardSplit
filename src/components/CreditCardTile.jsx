import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { gradientFor } from '../theme/cardGradients';
import { formatINR } from '../utils/currency';
import { formatDate } from '../utils/dates';
import { CARD_STATUS } from '../services/calculations/totals';

const STATUS_CHIP = {
  [CARD_STATUS.EMPTY]: { label: 'No transactions', color: 'default' },
  [CARD_STATUS.MATCHED]: { label: 'Matches statement', color: 'success' },
  [CARD_STATUS.MISMATCH]: { label: 'Needs review', color: 'warning' },
};

const whiteIcon = { color: 'rgba(255,255,255,0.85)', '&:hover': { color: '#fff' } };

export default function CreditCardTile({
  card,
  transactionCount,
  status,
  difference,
  unassignedCount = 0,
  onOpen,
  onEdit,
  onDelete,
}) {
  const chip = STATUS_CHIP[status];
  const body = (
    <Box sx={{ p: 2.5, minHeight: 190, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, pr: onEdit ? 9 : 0, lineHeight: 1.3 }}>
        {card.name}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: 2, opacity: 0.9 }}>
        •••• {card.last4}
      </Typography>
      <Box sx={{ flexGrow: 1 }} />
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {formatDate(card.statementStart)} – {formatDate(card.statementEnd)}
      </Typography>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 1 }}>
        <Box>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            Statement total
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {formatINR(card.statementTotalPaise)}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ opacity: 0.85 }}>
          {transactionCount} txn{transactionCount === 1 ? '' : 's'}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          size="small"
          label={chip.label}
          color={chip.color}
          sx={chip.color === 'default' ? { bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' } : undefined}
        />
        {unassignedCount > 0 && (
          <Chip size="small" label={`${unassignedCount} unassigned`} sx={{ bgcolor: 'rgba(255,255,255,0.9)', color: 'warning.dark' }} />
        )}
        {status === CARD_STATUS.MISMATCH && (
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            Difference {formatINR(difference)}
          </Typography>
        )}
      </Stack>
    </Box>
  );

  return (
    <Card
      elevation={3}
      sx={{ position: 'relative', background: gradientFor(card.gradientKey), color: '#fff', borderRadius: 3 }}
    >
      {onOpen ? <CardActionArea onClick={onOpen}>{body}</CardActionArea> : body}
      {(onEdit || onDelete) && (
        <Stack direction="row" sx={{ position: 'absolute', top: 8, right: 8 }}>
          {onEdit && (
            <Tooltip title="Edit card">
              <IconButton size="small" onClick={onEdit} sx={whiteIcon} aria-label={`Edit ${card.name}`}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onDelete && (
            <Tooltip title="Delete card">
              <IconButton size="small" onClick={onDelete} sx={whiteIcon} aria-label={`Delete ${card.name}`}>
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      )}
    </Card>
  );
}
