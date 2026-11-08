import type { MaybeRefOrGetter } from 'vue'

/**
 * How a deck page reads the error of a closed deck. The server answers three
 * ways: 401 with the `requiresPassword` flag (semi-private, ask for the deck
 * password), a plain 401 (private, ask to sign in), and 404 (signed in without
 * access, the answer of an address that does not exist). Only the flag sends to
 * the password prompt at `unlockPath`, which a plain 401 could never satisfy.
 *
 * The prompt replaces the deck page in the history: the page only ever sends
 * there, so Back from the prompt would run the redirect again.
 */
export function useClosedDeck(error: MaybeRefOrGetter<unknown>, unlockPath: string) {
  const failure = computed(() => toValue(error) as { statusCode?: number, data?: any } | null | undefined)
  // ofetch nests the server's createError payload under data.data; a direct h3
  // error keeps it at data. Read both so the flag survives either transport.
  const requiresPassword = computed(() => (failure.value?.data?.data ?? failure.value?.data)?.requiresPassword === true)
  const needsLogin = computed(() => !requiresPassword.value && failure.value?.statusCode === 401)
  // A deck the actor may not view answers 404 like a deck that does not exist, so
  // one screen covers both: naming either case would confirm the address. The
  // raw message of the failed request is left out for the same reason.
  const notFound = computed(() => failure.value?.statusCode === 404)
  const errorShown = computed(() => Boolean(failure.value) && !requiresPassword.value)

  watch(requiresPassword, (needsPassword) => {
    if (needsPassword)
      navigateTo(unlockPath, { replace: true })
  }, { immediate: true })

  return { needsLogin, notFound, errorShown }
}
