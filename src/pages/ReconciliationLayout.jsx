import { Outlet, Link as RouterLink, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useReconciliation } from '../features/reconciliations/useReconciliation';

/** Loads the reconciliation once and shares it (plus auto-saving actions) with child routes. */
export default function ReconciliationLayout() {
  const { id } = useParams();
  return <LoadedReconciliation key={id} id={id} />;
}

function LoadedReconciliation({ id }) {
  const recState = useReconciliation(id);

  if (recState.loadState === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (recState.loadState !== 'ready') {
    return (
      <Alert
        severity={recState.loadState === 'missing' ? 'warning' : 'error'}
        action={
          <Button component={RouterLink} to="/" color="inherit" size="small">
            Dashboard
          </Button>
        }
      >
        {recState.loadState === 'missing'
          ? 'This reconciliation was not found in this browser. It may have been deleted or saved on another device.'
          : 'Could not load this reconciliation.'}
      </Alert>
    );
  }

  return <Outlet context={recState} />;
}
