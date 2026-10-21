/** What the check reads of a request: its headers. */
interface RequestHeaders {
  get: (name: string) => string | null | undefined
}

/**
 * Why a browser request does not come from a page of this instance, or nothing.
 *
 * `instanceOrigin` is the address the browser called: h3's `getRequestURL` and
 * the crossws upgrade request build it from `Host` and `X-Forwarded-Proto`, as
 * nuxt-auth-utils does for the OAuth return address. `X-Forwarded-Host` is never
 * read. A page of another site cannot change `Host`, `Origin` or `Sec-Fetch-Site`
 * in the request its visitor's browser sends.
 *
 * A browser writes `Origin` on every request other than GET and HEAD, and on
 * every WebSocket upgrade; `Sec-Fetch-Site` stands in for it when a privacy
 * setting strips it. A request with neither does not come from a browser page,
 * and is refused all the same: the content scripts send the content token.
 */
export function crossOriginRefusal(headers: RequestHeaders, instanceOrigin: string): string | undefined {
  const origin = headers.get('origin')
  if (origin)
    return origin === instanceOrigin ? undefined : `Origin ${origin} is not ${instanceOrigin}`
  const site = headers.get('sec-fetch-site')
  if (site)
    return site === 'same-origin' ? undefined : `Sec-Fetch-Site is ${site}`
  return 'the request carries neither Origin nor Sec-Fetch-Site'
}
