/** A connected person, as the editor header shows it. */
export interface Peer {
  /** One per account; a person without an account counts once per tab. */
  key: string
  name: string
  color: string
  /** The account of this tab, open in another window or on another device. */
  self: boolean
}

interface PeerUser { name: string, color: string, login?: string }

/** The people connected to the deck besides this tab, from the awareness states, one entry per account. */
export function awarenessPeers(states: Map<number, Record<string, unknown>>, clientID: number, login?: string): Peer[] {
  const peers = new Map<string, Peer>()
  for (const [id, state] of states) {
    const user = state.user as PeerUser | undefined
    if (id === clientID || !user)
      continue
    const key = user.login ?? `client-${id}`
    peers.set(key, { key, name: user.name, color: user.color, self: Boolean(login) && user.login === login })
  }
  return [...peers.values()]
}

const PEER_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080']

/** The caret colour of an account, derived from its login so it stays the same across reloads. */
export function peerColor(login?: string): string {
  const hue = [...(login ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  return PEER_COLORS[hue % PEER_COLORS.length]!
}

/** The initials of a name or a login, two letters at most. */
export function peerInitials(name: string): string {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('')
}
