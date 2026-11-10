import type { ReactNode } from 'react'
import { LandingPage } from '../pages/LandingPage'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { AviatorPage } from '../pages/AviatorPage'
import { TradingPage } from '../pages/TradingPage'
import { TicTacToePage } from '../pages/TicTacToePage'
import { MiningPage } from '../pages/MiningPage'
import { NotificationsPage } from '../pages/NotificationsPage'
import { AdminPage } from '../pages/AdminPage'
import { WalletPage } from '../pages/WalletPage'
import { PaymentsPage } from '../pages/PaymentsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { SettingsPage } from '../pages/SettingsPage'

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
