import type { AppUser, Role } from '../types/auth'

/**
 * Permissions granulaires.
 * Les noms sont stables et indépendants des rôles ; un rôle est une collection
 * de permissions. Les permissions financières et de gestion des rôles sont
 * volontairement restreintes.
 */
export type Permission =
  | 'view_dashboard'
  | 'users.read'
  | 'users.suspend'
  | 'users.manage'
  | 'moderators.manage'
  | 'admins.manage'
  | 'roles.manage'
  | 'wallets.read'
  | 'wallets.adjust'
  | 'transactions.read'
  | 'games.manage'
  | 'games.toggle'
  | 'notifications.manage'
  | 'settings.manage'
  | 'audit.read'
  | 'payments.manage'
  | 'reports.read'
  | 'mining.withdrawals.read'
  | 'mining.anomalies.read'
  | 'mining.configure'

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  player: new Set<Permission>(['view_dashboard']),
  moderator: new Set<Permission>([
    'view_dashboard',
    'users.read',
    'transactions.read',
    'audit.read',
    'reports.read',
    'mining.anomalies.read',
  ]),
  admin: new Set<Permission>([
    'view_dashboard',
    'users.read',
    'users.suspend',
    'users.manage',
    'moderators.manage',
    'wallets.read',
    'transactions.read',
    'games.manage',
    'games.toggle',
    'notifications.manage',
    'audit.read',
    'reports.read',
    'mining.withdrawals.read',
    'mining.anomalies.read',
  ]),
  super_admin: new Set<Permission>([
    'view_dashboard',
    'users.read',
    'users.suspend',
    'users.manage',
    'moderators.manage',
    'admins.manage',
    'roles.manage',
    'wallets.read',
    'wallets.adjust',
    'transactions.read',
    'games.manage',
    'games.toggle',
    'notifications.manage',
    'settings.manage',
    'audit.read',
    'payments.manage',
    'reports.read',
  ]),
}

const ROLE_RANK: Record<Role, number> = {
  player: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
}

export function hasRole(user: AppUser | null, minimum: Role): boolean {
  if (!user || user.status !== 'active') return false
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum]
}

export function hasPermission(user: AppUser | null, permission: Permission): boolean {
  if (!user || user.status !== 'active') return false
  return ROLE_PERMISSIONS[user.role].has(permission)
}

export function hasAnyPermission(user: AppUser | null, permissions: readonly Permission[]): boolean {
  if (!user || user.status !== 'active') return false
  return permissions.some((permission) => ROLE_PERMISSIONS[user.role].has(permission))
}

export function listPermissions(user: AppUser | null): Permission[] {
  if (!user || user.status !== 'active') return []
  return [...ROLE_PERMISSIONS[user.role]]
}

// Adaptateurs conservés pour la compatibilité avec l'UI existante.
export function canAccessAdmin(user: AppUser | null): boolean {
  return hasPermission(user, 'users.read') && hasRole(user, 'admin')
}

/**
 * Accès à l'espace d'administration : modérateurs en lecture, administrateurs
 * et super-admins avec leurs permissions respectives.
 */
export function canAccessAdminPanel(user: AppUser | null): boolean {
  return hasAnyPermission(user, ['users.read', 'users.suspend', 'users.manage', 'audit.read'])
}

const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  player: [],
  moderator: [],
  admin: ['player', 'moderator'],
  super_admin: ['player', 'moderator', 'admin', 'super_admin'],
}

/** Un acteur ne peut attribuer que les rôles strictement inférieurs aux siens. */
export function canAssignRole(actor: AppUser | null, target: Role): boolean {
  if (!actor || actor.status !== 'active') return false
  if (!actor.demo && actor.role === 'super_admin') {
    // En production, la vérification serveur reste obligatoire.
    return ASSIGNABLE_ROLES.super_admin.includes(target)
  }
  return ASSIGNABLE_ROLES[actor.role].includes(target)
}

export function assignableRoles(actor: AppUser | null): Role[] {
  if (!actor || actor.status !== 'active') return []
  return [...ASSIGNABLE_ROLES[actor.role]]
}

export function canManageUsers(user: AppUser | null): boolean {
  return hasPermission(user, 'users.manage')
}

export function canViewLedger(user: AppUser | null): boolean {
  return hasPermission(user, 'transactions.read')
}

export function canAdjustBalance(user: AppUser | null): boolean {
  return hasPermission(user, 'wallets.adjust')
}

export function canManagePayments(user: AppUser | null): boolean {
  return hasPermission(user, 'payments.manage')
}

export function canManageRoles(user: AppUser | null): boolean {
  return hasPermission(user, 'roles.manage')
}

export function canManageModerators(user: AppUser | null): boolean {
  return hasPermission(user, 'moderators.manage')
}

export function canManageAdmins(user: AppUser | null): boolean {
  return hasPermission(user, 'admins.manage')
}

export function canManageGames(user: AppUser | null): boolean {
  return hasPermission(user, 'games.manage')
}

export function canToggleGames(user: AppUser | null): boolean {
  return hasPermission(user, 'games.toggle')
}

export function canManageNotifications(user: AppUser | null): boolean {
  return hasPermission(user, 'notifications.manage')
}

export function canManageSettings(user: AppUser | null): boolean {
  return hasPermission(user, 'settings.manage')
}

export function canReadAudit(user: AppUser | null): boolean {
  return hasPermission(user, 'audit.read')
}

export function canReadReports(user: AppUser | null): boolean {
  return hasPermission(user, 'reports.read')
}

export function canSuspendUsers(user: AppUser | null): boolean {
  return hasPermission(user, 'users.suspend')
}

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  player: [],
  moderator: [...ROLE_PERMISSIONS.moderator],
  admin: [...ROLE_PERMISSIONS.admin],
  super_admin: [...ROLE_PERMISSIONS.super_admin],
}
