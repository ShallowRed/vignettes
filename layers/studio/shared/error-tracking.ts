import { pathnameOf } from './origins/routes'

/**
 * What leaves an instance when it reports an error. The address of a page can
 * carry a ticket, and a request, a component or a failed query can carry a deck,
 * a password or a session.
 */

export const ERROR_TRACKING_DEFAULTS = {
  tracesSampleRate: 0,
  sendDefaultPii: false,
  maxBreadcrumbs: 0,
  attachProps: false,
  sendClientReports: false,
} as const

export interface ErrorTrackingEvent {
  message?: string
  transaction?: string
  user?: unknown
  breadcrumbs?: unknown
  extra?: unknown
  contexts?: Record<string, unknown> | null
  request?: {
    url?: string
    data?: unknown
    cookies?: unknown
    headers?: unknown
    query_string?: unknown
  }
  exception?: { values?: { value?: string, stacktrace?: { frames?: { filename?: string }[] } }[] }
}

// A parameter of an address: a `?` in the SQL of a failed query has no `key=value` after it.
const ADDRESS_PARAMETER = /[?&][\w.~%-]+=[^\s"'&]*/g

/** drizzle writes the values of a failed query after the SQL, in the message of its error. */
function scrubText(text: string): string {
  return text.split('\nparams:', 1)[0]!.replace(ADDRESS_PARAMETER, '')
}

/**
 * The SDK reports every error a server middleware throws, refusals included:
 * a 4xx answers a request the instance declines on purpose, often from a robot.
 */
export function isRequestRefusal(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}

export function scrubErrorEvent<T extends ErrorTrackingEvent>(event: T): T {
  delete event.user
  delete event.breadcrumbs
  delete event.extra
  if (event.contexts) {
    delete event.contexts.vue
    delete event.contexts.nuxt
  }
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    delete event.request.headers
    delete event.request.query_string
    if (event.request.url)
      event.request.url = pathnameOf(event.request.url)
  }
  if (event.transaction)
    event.transaction = pathnameOf(event.transaction)
  if (event.message)
    event.message = scrubText(event.message)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value)
      exception.value = scrubText(exception.value)
    // An error without a stack names the address of the page as its file.
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename)
        frame.filename = pathnameOf(frame.filename)
    }
  }
  return event
}
