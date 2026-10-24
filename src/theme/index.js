import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  colorSchemes: { light: true, dark: true },
  shape: { borderRadius: 10 },
  palette: {
    primary: { main: '#3b5bdb' },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
});
