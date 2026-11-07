import dagre from '@dagrejs/dagre'

export interface RankedCard {
  id?: string
  width: number
  height: number
}

export interface RankedLayout {
  /** The top left corner of each card, in the order of the cards. */
  corners: { left: number, top: number }[]
  width: number
  height: number
}

/**
 * Where dagre places the cards of a `layout="auto"` diagram, ranked along
 * `direction` by the arrows. A card without an `id`, or with the `id` of an
 * earlier card, takes a place of its own; an arrow ranks the cards when both
 * its ends name one.
 */
export function rankedLayout(cards: readonly RankedCard[], arrows: readonly { from: string, to: string }[], direction: 'LR' | 'TB'): RankedLayout {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: direction, nodesep: 36, ranksep: 64, marginx: 4, marginy: 4 })
  g.setDefaultEdgeLabel(() => ({}))
  const named = new Map<string, string>()
  cards.forEach((card, index) => {
    g.setNode(String(index), { width: card.width, height: card.height })
    if (card.id && !named.has(card.id))
      named.set(card.id, String(index))
  })
  for (const arrow of arrows) {
    const from = named.get(arrow.from)
    const to = named.get(arrow.to)
    if (from && to)
      g.setEdge(from, to)
  }
  dagre.layout(g)
  const { width = 0, height = 0 } = g.graph()
  return {
    corners: cards.map((_, index) => {
      const place = g.node(String(index))
      return { left: place.x - place.width / 2, top: place.y - place.height / 2 }
    }),
    width,
    height,
  }
}
