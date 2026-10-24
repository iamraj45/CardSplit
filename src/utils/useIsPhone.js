import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/** True below the `sm` breakpoint (phones), where lists replace tables and dialogs go full screen. */
export function useIsPhone() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
}
