/**
 * How the adapters match an identity at login: the placeholder of an invited
 * account, and the key under which two spellings of a handle name one account.
 */

/**
 * Placeholder providerId for an invited account that never logged in. Prefixed
 * so it can never collide with a real Google sub (subs are all digits), and
 * derived from the login so the first-login claim is a direct key lookup.
 */
const INVITED_PREFIX = 'invited:'

export function invitedPlaceholder(login: string): string {
  return `${INVITED_PREFIX}${login}`
}

export function isInvitedPlaceholder(providerId: string): boolean {
  return providerId.startsWith(INVITED_PREFIX)
}

/**
 * The comparison key under which two handles name the same account, so an
 * invitation matches whatever spelling the provider reports at login.
 * GitHub usernames are case-insensitive. Gmail ignores dots and `+suffix` in
 * the local part, and googlemail.com aliases gmail.com, but Google reports only
 * ONE canonical spelling at OAuth login: without this, inviting the wrong
 * spelling silently creates a grant nobody can ever claim. Non-gmail domains
 * keep their exact local part (dots are significant there).
 */
export function handleKey(provider: string, login: string): string {
  const lowered = login.trim().toLowerCase()
  if (provider !== 'google')
    return lowered
  const [local, domain] = lowered.split('@')
  if (!domain || (domain !== 'gmail.com' && domain !== 'googlemail.com'))
    return lowered
  return `${local!.split('+')[0]!.replaceAll('.', '')}@gmail.com`
}
