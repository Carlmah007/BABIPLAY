import type { ReactNode } from 'react'
import { lazy } from 'react'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { NotFoundPage } from '../pages/NotFoundPage'

// Pages chargées à la demande : chaque route est un chunk séparé, le bundle
// initial ne contient que la vitrine et les pages publiques.
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const AviatorPage = lazy(() =>
  import('../pages/AviatorPage').then((m) => ({ default: m.AviatorPage })),
)
const TradingPage = lazy(() =>
  import('../pages/TradingPage').then((m) => ({ default: m.TradingPage })),
)
const TicTacToePage = lazy(() =>
  import('../pages/TicTacToePage').then((m) => ({ default: m.TicTacToePage })),
)
const MiningPage = lazy(() =>
  import('../pages/MiningPage').then((m) => ({ default: m.MiningPage })),
)
const NotificationsPage = lazy(() =>
  import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const AdminPage = lazy(() =>
  import('../pages/AdminPage').then((m) => ({ default: m.AdminPage })),
)
const WalletPage = lazy(() =>
  import('../pages/WalletPage').then((m) => ({ default: m.WalletPage })),
)
const PaymentsPage = lazy(() =>
  import('../pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })),
)
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

export interface AppRoute {
  path: string
  element: ReactNode
  protected?: boolean
  adminOnly?: boolean
  chrome?: 'app' | 'public'
  label?: string
}

export const ROUTES: AppRoute[] = [
  {
    path: '/',
    element: <LandingPage />,
    chrome: 'public',
    label: 'Accueil',
  },
  {
    path: '/login',
    element: <LoginPage />,
    chrome: 'public',
    label: 'Connexion',
  },
  {
    path: '/register',
    element: <RegisterPage />,
    chrome: 'public',
    label: 'Inscription',
  },
  {
    path: '/dashboard',
    element: <DashboardPage />,
    protected: true,
    label: 'Tableau de bord',
  },
  {
    path: '/wallet',
    element: <WalletPage />,
    protected: true,
    label: 'Portefeuille',
  },
  {
    path: '/aviator',
    element: <AviatorPage />,
    protected: true,
    label: 'Aviator',
  },
  {
    path: '/trading',
    element: <TradingPage />,
    protected: true,
    label: 'Trading',
  },
  {
    path: '/tic-tac-toe',
    element: <TicTacToePage />,
    protected: true,
    label: 'Tic-Tac-Toe',
  },
  {
    path: '/mining',
    element: <MiningPage />,
    protected: true,
    label: 'Mining',
  },
  {
    path: '/notifications',
    element: <NotificationsPage />,
    protected: true,
    label: 'Notifications',
  },
  {
    path: '/profile',
    element: <ProfilePage />,
    protected: true,
    label: 'Profil',
  },
  {
    path: '/settings',
    element: <SettingsPage />,
    protected: true,
    label: 'Paramètres',
  },
  {
    path: '/payments',
    element: <PaymentsPage />,
    protected: true,
    label: 'Paiements',
  },
  {
    path: '/admin',
    element: <AdminPage />,
    protected: true,
    adminOnly: true,
    label: 'Super Admin',
  },
  {
    path: '/404',
    element: <NotFoundPage />,
    chrome: 'public',
    label: 'Page introuvable',
  },
]
