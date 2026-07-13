import type { PublicationStatus } from '../access/status'

// Presentation-status display config. `icon` is a Remix-icon name (`ri:*`).
export interface StatusDisplay {
  badge: string
  label: string
  icon: string
}

export const STATUS_CONFIG: Record<PublicationStatus, StatusDisplay> = {
  'public': { badge: 'badge-success', label: 'Public', icon: 'ri:global-line' },
  'semi-private': { badge: 'badge-warning', label: 'Password', icon: 'ri:lock-password-line' },
  'private': { badge: 'badge-info', label: 'Private', icon: 'ri:lock-line' },
  'draft': { badge: 'badge-ghost', label: 'Draft', icon: 'ri:draft-line' },
}
