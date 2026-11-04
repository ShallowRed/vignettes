/**
 * The reasons the collab server gives when it closes a connection that the
 * client must not reconnect: a tab of another Yjs lineage than the stored
 * draft, or a text past the deck limit. The editor stops and offers to reload.
 */
export const CLOSE_REASONS = { lineage: 'Draft lineage', tooLong: 'Deck too long' } as const

export const STOPPING_CLOSES: readonly string[] = Object.values(CLOSE_REASONS)

/**
 * The reasons the collab server gives when it refuses to open a room for a
 * connection, which the provider reports by its `authenticationFailed` event:
 * no deck, a published version past the deck limit, or another deck than the
 * one the socket was opened for.
 */
export const REFUSAL_REASONS = { notFound: 'deck-not-found', tooLong: 'deck-too-long', notPinned: 'not-pinned' } as const
