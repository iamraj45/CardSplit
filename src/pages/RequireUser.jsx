import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useCurrentUser } from '../features/user/currentUser';

/**
 * Sends anyone without a name (or an account still missing its display name) to the login page,
 * then back to where they were going. Waits while a saved session or magic link is being restored.
 */
export default function RequireUser() {
  const { user, ready } = useCurrentUser();
  const location = useLocation();
  if (!ready) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user || user.needsProfile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
