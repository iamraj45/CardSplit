import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import DashboardPage from '../pages/DashboardPage';
import LoginPage from '../pages/LoginPage';
import RequireUser from '../pages/RequireUser';
import ReconciliationLayout from '../pages/ReconciliationLayout';
import ReconciliationPage from '../pages/ReconciliationPage';
import CardTransactionsPage from '../pages/CardTransactionsPage';
import ReportPage from '../pages/ReportPage';
import NotFoundPage from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <RequireUser />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            path: 'r/:id',
            element: <ReconciliationLayout />,
            children: [
              { index: true, element: <ReconciliationPage /> },
              { path: 'card/:cardId', element: <CardTransactionsPage /> },
              { path: 'report', element: <ReportPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
