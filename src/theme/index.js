import { createTheme } from '@mui/material/styles';

// Button convention across the app: the main action on a page or dialog is `contained`,
// secondary actions are `outlined`, and small in-line links (Cancel, Open card) are text buttons.
export const theme = createTheme({
  colorSchemes: { light: true, dark: true },
  shape: { borderRadius: 10 },
  palette: {
    primary: { main: '#3b5bdb' },
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, whiteSpace: 'nowrap' },
      },
    },
  },
});
