import type { PublicationStatus } from '../access/status'

// Presentation-status display config: Nuxt UI semantic color, message key of the label, Iconify icon.
export interface StatusDisplay {
  color: 'success' | 'warning' | 'info' | 'neutral' | 'primary' | 'secondary' | 'error'
  labelKey: string
  icon: string
}

export const STATUS_CONFIG: Record<PublicationStatus, StatusDisplay> = {
  'public': { color: 'success', labelKey: 'common.status.public', icon: 'i-lucide-globe' },
  'semi-private': { color: 'warning', labelKey: 'common.status.semiPrivate', icon: 'i-lucide-key-round' },
  'private': { color: 'info', labelKey: 'common.status.private', icon: 'i-lucide-lock' },
}
