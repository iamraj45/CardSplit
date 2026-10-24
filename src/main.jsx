import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { router } from './app/routes';
import SyncProvider from './features/sync/SyncProvider';
import UserProvider from './features/user/UserProvider';
import { theme } from './theme';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <UserProvider>
        <SyncProvider>
          <RouterProvider router={router} />
        </SyncProvider>
      </UserProvider>
    </ThemeProvider>
  </StrictMode>,
);
