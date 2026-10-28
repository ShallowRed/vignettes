import type { Role } from './roles'
import { z } from 'zod'

/**
 * What a personal access token may do: `read` reads decks and folders, `write`
 * also creates, saves and publishes them. Either way the token acts with the
 * rights of its account.
 */
export const TokenScopeSchema = z.enum(['read', 'write'])
export type TokenScope = z.infer<typeof TokenScopeSchema>

/** A token lasts 90 days unless its holder chooses another duration, and a year at most: no token is permanent. */
export const DEFAULT_TOKEN_DAYS = 90
export const MAX_TOKEN_DAYS = 365

/** The durations the studio offers when it creates a token, in days. */
export const TOKEN_DURATIONS = [30, DEFAULT_TOKEN_DAYS, MAX_TOKEN_DAYS]

/** The longest name of a token. */
export const TOKEN_NAME_MAX_LENGTH = 100

/** What `POST /api/tokens` accepts. */
export const TokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(TOKEN_NAME_MAX_LENGTH),
  scope: TokenScopeSchema,
  days: z.number().int().min(1).max(MAX_TOKEN_DAYS).default(DEFAULT_TOKEN_DAYS),
})
export type TokenRequest = z.input<typeof TokenRequestSchema>

/** `write` includes `read`. */
export function scopeAllows(scope: TokenScope, required: TokenScope): boolean {
  return scope === 'write' || required === 'read'
}

/**
 * The role a token acts with: its account's role, capped at `editor`. The
 * accounts, the folder grants and the trash stay with a session of the owner.
 */
export function tokenRole(role: Role): Role {
  return role === 'owner' ? 'editor' : role
}

export type TokenState = 'active' | 'revoked' | 'expired'

export function tokenState(token: { revokedAt: Date | null, expiresAt: Date }, now: Date): TokenState {
  if (token.revokedAt)
    return 'revoked'
  return token.expiresAt.getTime() <= now.getTime() ? 'expired' : 'active'
}

/** A token as `/api/tokens` lists it, its dates in ISO 8601. */
export interface TokenSummary {
  id: number
  name: string
  prefix: string
  scope: TokenScope
  state: TokenState
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}
