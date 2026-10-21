import { z } from 'zod'

/**
 * What a personal access token may do: `read` reads decks and folders, `write`
 * also creates, saves and publishes them. Either way the token acts with the
 * rights of its account.
 */
export const TokenScopeSchema = z.enum(['read', 'write'])
export type TokenScope = z.infer<typeof TokenScopeSchema>
