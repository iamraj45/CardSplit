import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { loadCurrentUser, useCurrentUser } from '../features/user/currentUser';
import { localStorageAdapter } from '../services/storage';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Plain-language versions of the sign-in errors people actually hit. */
function friendlyAuthError(err) {
  const message = err?.message ?? '';
  if (err?.status === 429 || /rate limit|too many/i.test(message)) {
    return 'Too many sign-in emails were sent recently. Use the most recent email you received, or try again in about an hour.';
  }
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(message)) {
    return 'That code or link has expired or was already used. Request a new sign-in email.';
  }
  if (/fetch|network/i.test(message)) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}

/**
 * Sign in with an email link (accounts + sync, when Supabase is configured), or continue without
 * an account (name only, data stays in this browser). After a first account sign-in, asks for a
 * display name.
 */
export default function LoginPage() {
  const { user, ready, accountsEnabled, signIn, sendSignInEmail, verifyCode, completeProfile } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? '/';
  const [step, setStep] = useState(accountsEnabled ? 'email' : 'local'); // email | sent | local
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => loadCurrentUser()?.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    localStorageAdapter.listPeople().then(setSaved).catch(() => setSaved([]));
  }, []);

  if (ready && user && !user.needsProfile) return <Navigate to={from} replace />;
  const needsProfile = user?.mode === 'account' && user.needsProfile;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const continueLocally = (value) => {
    setSubmitted(true);
    if (!value.trim()) return;
    run(async () => {
      await signIn(value);
      navigate(from, { replace: true });
    });
  };

  const sendLink = () => {
    setSubmitted(true);
    if (!EMAIL.test(email.trim())) return;
    run(async () => {
      await sendSignInEmail(email);
      setSubmitted(false);
      setStep('sent');
    });
  };

  const submitCode = () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    run(() => verifyCode(email, code));
  };

  const saveProfileName = () => {
    setSubmitted(true);
    if (!name.trim()) return;
    run(() => completeProfile(name));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (needsProfile) saveProfileName();
    else if (step === 'email') sendLink();
    else if (step === 'sent') submitCode();
    else continueLocally(name);
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: { xs: 3, sm: 8 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, width: '100%', maxWidth: 440 }}>
        <Stack spacing={3} component="form" noValidate onSubmit={onSubmit}>
          <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Box component="img" src="/logo.png" alt="" sx={{ width: 112, height: 'auto' }} />
            <Box component="h1" sx={{ m: 0, lineHeight: 0 }}>
              <Box component="img" src="/cardsplit-wordmark.png" alt="CardSplit" sx={{ width: { xs: 220, sm: 260 }, height: 'auto' }} />
            </Box>
            <Typography color="primary" sx={{ fontWeight: 600 }}>
              Every card. Every expense. Accounted for.
            </Typography>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {needsProfile ? (
            <>
              <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                Signed in as {user.email}. What should we call you?
              </Typography>
              <TextField
                label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={submitted && !name.trim()}
                helperText={submitted && !name.trim() ? 'Enter your name to continue' : 'Shown to people you share with.'}
                autoFocus
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
                Continue
              </Button>
            </>
          ) : step === 'email' ? (
            <>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={submitted && !EMAIL.test(email.trim())}
                helperText={submitted && !EMAIL.test(email.trim()) ? 'Enter a valid email address' : 'We’ll email you a sign-in link — no password needed.'}
                autoComplete="email"
                inputMode="email"
                autoFocus
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
                Email me a sign-in link
              </Button>
              <Divider>or</Divider>
              <Button variant="outlined" onClick={() => { setSubmitted(false); setError(null); setStep('local'); }} fullWidth>
                Continue without an account
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                With an account your reconciliations sync across devices and can be shared. They are stored with our
                database provider (Supabase), protected so only you and people you invite can see them.
              </Typography>
            </>
          ) : step === 'sent' ? (
            <>
              <Alert severity="success">
                Check <strong>{email.trim()}</strong> for a sign-in link. Open it on this device to continue.
              </Alert>
              <TextField
                label="Or enter the 6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' } }}
                helperText="Useful if the link opens in a different browser."
                fullWidth
              />
              <Button type="submit" variant="contained" size="large" disabled={busy || code.length !== 6} fullWidth>
                Sign in with code
              </Button>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Button size="small" onClick={() => { setCode(''); setStep('email'); }}>
                  Use a different email
                </Button>
                <Button size="small" onClick={() => run(() => sendSignInEmail(email))} disabled={busy}>
                  Send again
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
                What should we call you?
              </Typography>
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
                      <Chip key={p.id} label={p.name} onClick={() => continueLocally(p.name)} disabled={busy} />
                    ))}
                  </Stack>
                </Stack>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                No account needed. Your data stays in this browser on this device.
              </Typography>
              {accountsEnabled && (
                <Button size="small" onClick={() => { setSubmitted(false); setError(null); setStep('email'); }}>
                  Sign in with email instead
                </Button>
              )}
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
