import type { H3Event } from 'h3'
import { serverConfig } from './config'

/**
 * The address of the client, which the rate limits count by. Each proxy in
 * front of the server appends to `X-Forwarded-For` the address it received the
 * request from, so behind `trustedProxyHops` proxies the client is the value at
 * that rank from the right. The values on the left come from the client itself.
 * Caddy, without `trusted_proxies`, replaces the header with that one address
 * (https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults),
 * and the Scalingo router adds the address of the client
 * (https://doc.scalingo.com/platform/internals/routing): one hop for each.
 * Without a proxy, or with fewer values than hops, the address of the socket.
 */
export function clientAddress(event: H3Event): string {
  const socket = getRequestIP(event) ?? 'unknown'
  const hops = serverConfig().trustedProxyHops
  if (hops === 0)
    return socket
  const chain = (getRequestHeader(event, 'x-forwarded-for') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  return chain.at(-hops) ?? socket
}
