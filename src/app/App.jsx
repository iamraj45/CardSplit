import { Outlet, Link as RouterLink } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
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
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
          >
            Card Reconciliation
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, '@media print': { p: 0, maxWidth: 'none' } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
