/**
 * A fetcher the service layer stays agnostic about: pass `$fetch` for
 * client-side calls, or `useRequestFetch()` on SSR to forward the session
 * cookie. A minimal call-signature interface (not the full ofetch `$Fetch`) so
 * every variant is assignable — including the SSR `H3Event$Fetch`, which lacks
 * `$Fetch`'s `raw`/`native`/`create` helpers we never use here.
 */
export interface Fetcher {
  <T = unknown>(request: string, options?: Record<string, unknown>): Promise<T>
}
