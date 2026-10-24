import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '../features/user/currentUser';

/** Sends anyone without a name to the login page, then back to where they were going. */
export default function RequireUser() {
  const { user } = useCurrentUser();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
