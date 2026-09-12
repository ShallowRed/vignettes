import type { Role } from './roles'

/** Role display config shown in the app header: Nuxt UI semantic color + Iconify icon. */
export interface RoleDisplay {
  color: 'primary' | 'secondary' | 'neutral'
  label: string
  icon: string
}

export const ROLE_CONFIG: Record<Role, RoleDisplay> = {
  owner: { color: 'primary', label: 'Owner', icon: 'i-lucide-crown' },
  editor: { color: 'secondary', label: 'Editor', icon: 'i-lucide-pen-line' },
  viewer: { color: 'neutral', label: 'Viewer', icon: 'i-lucide-eye' },
  anonymous: { color: 'neutral', label: 'Guest', icon: 'i-lucide-user' },
}
