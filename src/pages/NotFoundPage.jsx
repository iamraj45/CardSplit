import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

export default function NotFoundPage() {
  return (
    <Alert
      severity="warning"
      action={
        <Button component={RouterLink} to="/" color="inherit" size="small">
          Dashboard
        </Button>
      }
    >
      Page not found.
    </Alert>
  );
}
