import type { H3Event } from 'h3'
import { clientAddress } from './client-address'

/** The events of the security log. */
export type SecurityEvent
  = | 'login'
    | 'login-failure'
    | 'logout'
    | 'role-change'
    | 'account-removal'
    | 'grant-change'
    | 'deck-password-change'
    | 'deck-password-lockout'
    | 'token-creation'
    | 'token-revocation'

type Details = Record<string, string | number | null | undefined>

/** A value as is when it holds no space nor quote, else as a JSON string, so that one event stays on one line. */
function field(value: string | number | null): string {
  const text = String(value)
  return /^[\w@.:+/-]+$/.test(text) ? text : JSON.stringify(text)
}

/**
 * One line per event that changes who may enter or do what: the event, its
 * details, the account that acted and the client address. The callers pass no
 * secret in the details: no password, token, cookie or provider message.
 */
export function securityLog(event: H3Event, action: SecurityEvent, details: Details, actor?: string): void {
  const fields = Object.entries(details).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${field(value!)}`)
  console.info(`[security] ${[action, ...fields].join(' ')} by ${field(actor ?? 'anonymous')} from ${clientAddress(event)}`)
}
