import { useState } from 'react';
import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import AccountCircleOutlined from '@mui/icons-material/AccountCircleOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import { useCurrentUser } from '../features/user/currentUser';
import Container from '@mui/material/Container';
import GlobalStyles from '@mui/material/GlobalStyles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import CreditCard from '@mui/icons-material/CreditCard';

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
  const { user, signOut } = useCurrentUser();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  if (!user) return null;
  return (
    <>
      <Button
        color="inherit"
        startIcon={<AccountCircleOutlined />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={`Signed in as ${user.name}`}
        sx={{ ml: 'auto' }}
      >
        {user.name}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            signOut();
            navigate('/login');
          }}
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Switch user
        </MenuItem>
      </Menu>
    </>
  );
}

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', '@media print': { bgcolor: '#fff' } }}>
      {printStyles}
      <AppBar position="sticky" color="primary" elevation={0} sx={{ displayPrint: 'none' }}>
        <Toolbar>
          <CreditCard sx={{ mr: 1.5 }} />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            noWrap
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
          >
            CardSplit
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, '@media print': { p: 0, maxWidth: 'none' } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
