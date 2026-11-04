import { PREFERENCE_COOKIE } from '../utils/preference-cookie'

/**
 * A choice on or off kept per browser in the cookie `name`, which the server
 * reads too: the page renders with the choice. `initial` holds until the
 * person makes it.
 */
export function useBrowserPreference(name: string, initial: boolean): Ref<boolean> {
  const stored = useCookie<boolean | undefined>(name, PREFERENCE_COOKIE)
  return computed({
    get: () => stored.value ?? initial,
    set: (on) => {
      stored.value = on
    },
  })
}
