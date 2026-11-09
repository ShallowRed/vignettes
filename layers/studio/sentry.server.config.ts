import * as Sentry from '@sentry/nuxt'
import { ERROR_TRACKING_DEFAULTS, scrubErrorEvent } from './shared/error-tracking'

const { dsn, environment } = useRuntimeConfig().public.errorTracking

if (dsn) {
  Sentry.init({
    ...ERROR_TRACKING_DEFAULTS,
    dsn,
    environment: environment || undefined,
    beforeSend: event => scrubErrorEvent(event),
  })
}
