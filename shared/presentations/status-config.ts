import type { PublicationStatus } from '../access/status'

// Presentation-status display config: Nuxt UI semantic color + Iconify icon.
export interface StatusDisplay {
  color: 'success' | 'warning' | 'info' | 'neutral' | 'primary' | 'secondary' | 'error'
  label: string
  icon: string
}

export const STATUS_CONFIG: Record<PublicationStatus, StatusDisplay> = {
  'public': { color: 'success', label: 'Public', icon: 'i-lucide-globe' },
  'semi-private': { color: 'warning', label: 'Password', icon: 'i-lucide-key-round' },
  'private': { color: 'info', label: 'Private', icon: 'i-lucide-lock' },
  'draft': { color: 'neutral', label: 'Draft', icon: 'i-lucide-file-pen-line' },
}
