import type { IconName } from '../../components/ui/Icon'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  description?: string
  adminOnly?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Tableau de bord', icon: 'home', description: 'Vue d’ensemble' },
  { to: '/wallet', label: 'Portefeuille', icon: 'wallet', description: 'Solde et historique' },
  { to: '/aviator', label: 'Aviator', icon: 'plane', description: 'Jeu de multiplicateur' },
  { to: '/trading', label: 'Trading', icon: 'chart', description: 'Marchés simulés' },
  { to: '/tic-tac-toe', label: 'Tic-Tac-Toe', icon: 'grid', description: 'Défier l’IA' },
  { to: '/mining', label: 'Mining', icon: 'activity', description: 'GPU simulés' },
]

export const SECONDARY_NAV: NavItem[] = [
  { to: '/payments', label: 'Paiements', icon: 'coins', description: 'Dépôts et retraits' },
  { to: '/notifications', label: 'Notifications', icon: 'bell' },
  { to: '/profile', label: 'Profil', icon: 'user' },
  { to: '/settings', label: 'Paramètres', icon: 'settings' },
]

export const ADMIN_NAV: NavItem = {
  to: '/admin',
  label: 'Super Admin',
  icon: 'shield',
  adminOnly: true,
}

export const MOBILE_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Accueil', icon: 'home' },
  { to: '/wallet', label: 'Solde', icon: 'wallet' },
  { to: '/payments', label: 'Retrait', icon: 'coins' },
  { to: '/aviator', label: 'Aviator', icon: 'plane' },
  { to: '/trading', label: 'Trading', icon: 'chart' },
  { to: '/mining', label: 'Mining', icon: 'activity' },
]
