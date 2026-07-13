import type { Role } from './roles'

/** Role display config shown in the app header. `icon` is a `ri:*` Iconify name. */
export interface RoleDisplay {
  badge: string
  label: string
  icon: string
}

export const ROLE_CONFIG: Record<Role, RoleDisplay> = {
  owner: { badge: 'badge-primary', label: 'Owner', icon: 'ri:vip-crown-line' },
  editor: { badge: 'badge-secondary', label: 'Editor', icon: 'ri:quill-pen-line' },
  viewer: { badge: 'badge-ghost', label: 'Viewer', icon: 'ri:eye-line' },
  anonymous: { badge: 'badge-ghost', label: 'Guest', icon: 'ri:user-line' },
}
