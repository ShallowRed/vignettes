import * as Sentry from '@sentry/nuxt'
import { ERROR_TRACKING_DEFAULTS, scrubErrorEvent } from './shared/error-tracking'

const { dsn, environment } = useRuntimeConfig().public.errorTracking

if (dsn) {
  Sentry.init({
    ...ERROR_TRACKING_DEFAULTS,
    dsn,
    environment: environment || undefined,
    // Errors raised by browsers and their extensions.
    ignoreErrors: ['ResizeObserver loop', 'Failed to fetch', 'NetworkError when attempting', 'Load failed', 'AbortError'],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
    beforeSend: event => scrubErrorEvent(event),
  })
}
