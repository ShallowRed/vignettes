import type { Role } from './roles'

/** Role display config shown in the app header: Nuxt UI semantic color, message key of the label, Iconify icon. */
export interface RoleDisplay {
  color: 'primary' | 'secondary' | 'neutral'
  labelKey: string
  icon: string
}

export const ROLE_CONFIG: Record<Role, RoleDisplay> = {
  owner: { color: 'primary', labelKey: 'common.role.owner', icon: 'i-lucide-crown' },
  editor: { color: 'secondary', labelKey: 'common.role.editor', icon: 'i-lucide-pen-line' },
  viewer: { color: 'neutral', labelKey: 'common.role.viewer', icon: 'i-lucide-eye' },
  anonymous: { color: 'neutral', labelKey: 'common.role.anonymous', icon: 'i-lucide-user' },
}
