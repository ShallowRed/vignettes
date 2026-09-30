import type { Role } from './roles'

/** Roles assigned at GitHub login from an env map; logins lowercased. */
export interface RoleMap {
  owner: string[]
  editor: string[]
}

function parseLogins(value: string | undefined): string[] {
  return value
    ? value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : []
}

/** Read the role map from `NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`; the caller passes the environment. */
export function readRoleMap(env: Record<string, string | undefined>): RoleMap {
  return {
    owner: parseLogins(env.NUXT_OWNER_LOGINS),
    editor: parseLogins(env.NUXT_EDITOR_LOGINS),
  }
}

/** `null`/empty → anonymous; owner wins over editor; unknown login → viewer. */
export function resolveRole(login: string | null | undefined, map: RoleMap): Role {
  if (!login)
    return 'anonymous'
  const key = login.toLowerCase()
  if (map.owner.includes(key))
    return 'owner'
  if (map.editor.includes(key))
    return 'editor'
  return 'viewer'
}
