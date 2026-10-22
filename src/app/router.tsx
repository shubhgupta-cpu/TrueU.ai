import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RequireAuth, RequireRole } from '@/app/auth';
import { AppLayout } from '@/app/layout';
import UsersPage from '@/pages/admin-users';
import UsagePage from '@/pages/admin-usage';
import ApprovePage from '@/pages/approve';
import CalendarPage from '@/pages/calendar';
import ContentPackPage from '@/pages/content-pack';
import GraphicsPage from '@/pages/graphics';
import InboxPage from '@/pages/inbox';
import LoginPage from '@/pages/login';
import NoAccessPage from '@/pages/no-access';
import NotFoundPage from '@/pages/not-found';
import PipelinePage from '@/pages/pipeline';
import ProjectPage from '@/pages/project';
import TopicPage from '@/pages/topic';
import ProjectSchedulePage from '@/pages/project-schedule';
import PromptsPage from '@/pages/prompts';
import SettingsPage from '@/pages/settings';
import { staffRoles } from '@/lib/status';

// Routes from docs/spec.md §7.
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/approve/:token', element: <ApprovePage /> }, // public: token-authenticated (F7.2)
  {
    element: <RequireAuth />,
    children: [
      { path: '/no-access', element: <NoAccessPage /> },
      {
        element: <RequireRole roles={staffRoles} />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/inbox" replace /> },
              { path: '/inbox', element: <InboxPage /> },
              { path: '/topics/:id', element: <TopicPage /> },
              { path: '/projects/:id', element: <ProjectPage /> },
              { path: '/projects/:id/content', element: <ContentPackPage /> },
              { path: '/projects/:id/graphics', element: <GraphicsPage /> },
              { path: '/projects/:id/schedule', element: <ProjectSchedulePage /> },
              { path: '/calendar', element: <CalendarPage /> },
              { path: '/pipeline', element: <PipelinePage /> },
              { path: '/settings/*', element: <SettingsPage /> },
              {
                element: <RequireRole roles={['admin']} />,
                children: [
                  { path: '/prompts', element: <PromptsPage /> },
                  { path: '/admin/users', element: <UsersPage /> },
                  { path: '/admin/usage', element: <UsagePage /> },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
