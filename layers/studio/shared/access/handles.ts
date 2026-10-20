import { z } from 'zod'

/**
 * Provider handles: how an account is named before it has ever logged in — a
 * Google email or a GitHub username. The shape check is shared by the sharing
 * panels and the accounts page so both enable their button on the same rule;
 * the routes that invite a handle validate it with `ProviderHandleSchema`.
 */

export type IdentityProvider = 'google' | 'github'

// A GitHub username can never contain `@`, so the two namespaces stay distinct.
export const ProviderHandleSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('google'), handle: z.string().email().max(254) }).strict(),
  z.object({ provider: z.literal('github'), handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/i) }).strict(),
])
export type ProviderHandle = z.infer<typeof ProviderHandleSchema>

/** Offered by every provider picker, in one order. */
export const IDENTITY_PROVIDER_ITEMS: { label: string, value: IdentityProvider }[] = [
  { label: 'Google', value: 'google' },
  { label: 'GitHub', value: 'github' },
]

export function isProviderHandle(provider: IdentityProvider, handle: string): boolean {
  const value = handle.trim()
  if (provider === 'github')
    return value.length > 0 && !value.includes('@')
  const [local, domain, ...rest] = value.split('@')
  return rest.length === 0 && !!local && !!domain && domain.includes('.')
}

/** Message keys of the placeholder and the label of the handle field, per provider. */
export function handleField(provider: IdentityProvider): { labelKey: string, placeholderKey: string } {
  return provider === 'google'
    ? { labelKey: 'deck.handles.googleLabel', placeholderKey: 'deck.handles.googlePlaceholder' }
    : { labelKey: 'deck.handles.githubLabel', placeholderKey: 'deck.handles.githubPlaceholder' }
}
