import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ASSIGNMENT, SPLIT_METHODS, assignmentState } from '../services/calculations/splitCalculations';
import { formatINR } from '../utils/currency';

const METHOD_LABEL = {
  [SPLIT_METHODS.EQUAL]: 'Equal',
  [SPLIT_METHODS.PERCENTAGE]: '%',
  [SPLIT_METHODS.CUSTOM]: 'Custom',
};

/** Compact "who pays" display for a transaction or adjustment. */
export default function AllocationSummary({ item, people, onClick }) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const { state, result } = assignmentState(item, new Set(names.keys()));

  if (state === ASSIGNMENT.UNASSIGNED) {
    return <Chip size="small" label="Unassigned" color="warning" variant="outlined" onClick={onClick} />;
  }
  if (state === ASSIGNMENT.INVALID) {
    return (
      <Tooltip title={result.error}>
        <Chip size="small" label="Fix split" color="error" variant="outlined" onClick={onClick} />
      </Tooltip>
    );
  }

  if (item.split.method === SPLIT_METHODS.SINGLE) {
    return <Typography variant="body2">{names.get(result.shares[0].personId)}</Typography>;
  }
  return (
    <Typography variant="body2">
      <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        {METHOD_LABEL[item.split.method]}:
      </Typography>
      {result.shares.map((s) => `${names.get(s.personId)} ${formatINR(s.paise)}`).join(' · ')}
    </Typography>
  );
}
