import { getPremiumActivation } from '~services/premium'

export const FREE_SLOT_LIMIT = 5

export class SlotLimitError extends Error {
  constructor(message = 'SLOT_LIMIT_EXCEEDED') {
    super(message)
    this.name = 'SlotLimitError'
  }
}

export function isPremiumActivatedLocally() {
  // Premium disabled – always treat as activated to remove limits
  return true
}

export function enforceFreeSlotsOrThrow(_currentCount: number) {
  // No-op – free plan limits removed
}
