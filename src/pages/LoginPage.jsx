import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCurrentUser } from '../features/user/currentUser';
import { storage } from '../services/storage';

/** Name-only sign-in: no password, it just tells the app who "me" is on this device. */
export default function LoginPage() {
  const { user, signIn } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    storage.listPeople().then(setSaved).catch(() => setSaved([]));
  }, []);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const go = async (value) => {
    setSubmitted(true);
    if (!value.trim()) return;
    setBusy(true);
    try {
      await signIn(value);
      navigate(location.state?.from ?? '/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 4, sm: 10 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, width: '100%', maxWidth: 440 }}>
        <Stack spacing={3} component="form" noValidate onSubmit={(e) => { e.preventDefault(); go(name); }}>
          <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Box component="img" src="/logo.png" alt="" sx={{ width: 112, height: 'auto' }} />
            <Box component="h1" sx={{ m: 0, lineHeight: 0 }}>
              <Box component="img" src="/cardsplit-wordmark.png" alt="CardSplit" sx={{ width: { xs: 220, sm: 260 }, height: 'auto' }} />
            </Box>
            <Typography color="primary" sx={{ fontWeight: 600 }}>
              Every card. Every expense. Accounted for.
            </Typography>
            <Typography color="text.secondary" sx={{ pt: 1 }}>
              What should we call you?
            </Typography>
          </Stack>

          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={submitted && !name.trim()}
            helperText={submitted && !name.trim() ? 'Enter your name to continue' : 'Expenses you pay for will be assigned to this name.'}
            autoFocus
            autoComplete="given-name"
            fullWidth
          />

          <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
            Continue
          </Button>

          {saved.length > 0 && (
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Or continue as
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {saved.map((p) => (
                  <Chip key={p.id} label={p.name} onClick={() => go(p.name)} disabled={busy} />
                ))}
              </Stack>
            </Stack>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            No password needed. Your data stays in this browser on this device.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
