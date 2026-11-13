export type Role = 'player' | 'moderator' | 'admin' | 'super_admin'

export type AccountStatus = 'active' | 'suspended'

export interface AppUser {
  id: string
  email: string
  displayName: string
  role: Role
  status: AccountStatus
  demo: boolean
  createdAt: string
}

export interface Session {
  token: string
  userId: string
  createdAt: string
  user: AppUser
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  displayName: string
  email: string
  password: string
  /** Code d'affiliation saisi via le lien de parrainage (optionnel). */
  referredByCode?: string
}
