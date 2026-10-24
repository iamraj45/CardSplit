import { useState } from 'react';
import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import { useCurrentUser } from '../features/user/currentUser';
import Container from '@mui/material/Container';
import GlobalStyles from '@mui/material/GlobalStyles';
import Toolbar from '@mui/material/Toolbar';

// Paper output: black on white regardless of the on-screen colour scheme, no app chrome.
const printStyles = (
  <GlobalStyles
    styles={{
      '@page': { margin: '14mm' },
      '@media print': {
        body: { background: '#fff !important' },
        '.print-plain, .print-plain *': {
          color: '#000 !important',
          backgroundColor: 'transparent !important',
          boxShadow: 'none !important',
        },
        '.print-plain .MuiChip-root': { border: '1px solid #000' },
        '.print-plain .MuiTableCell-root': { borderColor: '#ccc !important' },
      },
    }}
  />
);

function UserMenu() {
  const { user, signOut, accountsEnabled } = useCurrentUser();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [removeData, setRemoveData] = useState(false);
  if (!user || user.needsProfile) return null;
  const isAccount = user.mode === 'account';

  const leave = async (opts) => {
    setAnchor(null);
    setConfirmSignOut(false);
    await signOut(opts);
    navigate('/login');
  };

  return (
    <>
      <Button
        color="inherit"
        startIcon={<AccountCircleOutlined />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`Signed in as ${user.name}`}
        sx={{
          ml: 'auto',
          minWidth: 0,
          fontSize: { xs: '1rem', sm: '1.0625rem' },
          '& .MuiButton-startIcon': { mr: { xs: 0.5, sm: 1 } },
          '& .MuiButton-startIcon > *:nth-of-type(1)': { fontSize: 26 },
        }}
      >
        <Box component="span" sx={{ maxWidth: { xs: 90, sm: 200 }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.name}
        </Box>
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isAccount ? user.email : 'No account — data stays on this device'}
          </Typography>
        </MenuItem>
        <Divider />
        {isAccount ? (
          <MenuItem onClick={() => { setAnchor(null); setConfirmSignOut(true); }}>
            <ListItemIcon>
              <LogoutOutlined fontSize="small" />
            </ListItemIcon>
            Sign out
          </MenuItem>
        ) : (
          [
            accountsEnabled && (
              <MenuItem key="signin" onClick={() => leave()}>
                <ListItemIcon>
                  <CloudSyncOutlined fontSize="small" />
                </ListItemIcon>
                Sign in to sync
              </MenuItem>
            ),
            <MenuItem key="switch" onClick={() => leave()}>
              <ListItemIcon>
                <LogoutOutlined fontSize="small" />
              </ListItemIcon>
              Switch user
            </MenuItem>,
          ]
        )}
      </Menu>

      <Dialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Sign out?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your reconciliations stay in your account. Changes not yet synced are kept on this device and sync when
            you sign in again.
          </Typography>
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Checkbox checked={removeData} onChange={(e) => setRemoveData(e.target.checked)} />}
            label="Also remove this account’s data from this device (unsynced changes will be lost)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmSignOut(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => leave({ removeData })}>
            Sign out
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', '@media print': { bgcolor: '#fff' } }}>
      {printStyles}
      <AppBar position="sticky" color="primary" elevation={0} sx={{ displayPrint: 'none' }}>
        <Toolbar>
          <Box
            component={RouterLink}
            to="/"
            aria-label="CardSplit home"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', minWidth: 0 }}
          >
            <Box component="img" src="/logo.png" alt="" sx={{ height: 28, width: 'auto' }} />
            <Box component="img" src="/cardsplit-wordmark.png" alt="CardSplit" sx={{ height: { xs: 20, sm: 24 }, width: 'auto' }} />
          </Box>
          <UserMenu />
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ pt: 0, pb: { xs: 2, sm: 4 }, '@media print': { p: 0, maxWidth: 'none' } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
