import type { LedgerMovementType } from '../types/wallet'

export const MOVEMENT_LABELS: Record<LedgerMovementType, string> = {
  initial_balance: 'Solde initial',
  game_stake: 'Mise de jeu',
  game_win: 'Gain de jeu',
  game_loss: 'Perte de jeu',
  trading_open: 'Ouverture de position',
  trading_profit: 'Gain de trading',
  trading_loss: 'Perte de trading',
  deposit: 'Dépôt',
  withdrawal: 'Retrait',
  refund: 'Remboursement',
  adjustment: 'Ajustement',
  mining_purchase: 'Achat de machine',
  mining_reward: 'Retrait de minage',
}

export const MOVEMENT_TONES: Record<
  LedgerMovementType,
  'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
> = {
  initial_balance: 'brand',
  game_stake: 'warning',
  game_win: 'success',
  game_loss: 'danger',
  trading_open: 'warning',
  trading_profit: 'success',
  trading_loss: 'danger',
  deposit: 'success',
  withdrawal: 'warning',
  refund: 'info',
  adjustment: 'brand',
  mining_purchase: 'warning',
  mining_reward: 'success',
}
