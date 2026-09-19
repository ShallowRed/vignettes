/**
 * Provider handles: how an account is named before it has ever logged in — a
 * Google email or a GitHub username. The shape check is shared by the sharing
 * panels and the accounts page so both enable their button on the same rule;
 * `POST /api/admin/users/invite` validates for real.
 */

export type IdentityProvider = 'google' | 'github'

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
