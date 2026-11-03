/**
 * Placement of the children of a `:::Sequence` on its grid. The first column
 * holds the times and the state names; each `::Actor` takes the next column,
 * in writing order.
 */

const FIRST_ACTOR_COLUMN = 2

/** The ids of a comma-separated attribute, `a, b` → `['a', 'b']`. */
export function ids(list?: string): string[] {
  return list?.split(',').map(v => v.trim()).filter(Boolean) ?? []
}

/** Grid column of a participant, or `undefined` for an id no `::Actor` declares. */
export function actorColumn(actors: readonly string[], id: string): number | undefined {
  const index = actors.indexOf(id)
  return index < 0 ? undefined : index + FIRST_ACTOR_COLUMN
}

/** The participants from the first to the last that `over` names, in column order; all of them when it names none. */
export function actorsCovered(actors: readonly string[], over?: string): string[] {
  const indexes = ids(over).map(id => actors.indexOf(id)).filter(i => i >= 0)
  if (!indexes.length)
    return [...actors]
  return actors.slice(Math.min(...indexes), Math.max(...indexes) + 1)
}

/** `grid-column` of the participants that `over` names, from the first to the last; all of them when it names none. */
export function actorsSpan(actors: readonly string[], over?: string): string {
  const columns = ids(over).map(id => actorColumn(actors, id)).filter(c => c !== undefined)
  if (!columns.length)
    return `${FIRST_ACTOR_COLUMN} / ${actors.length + FIRST_ACTOR_COLUMN}`
  return `${Math.min(...columns)} / ${Math.max(...columns) + 1}`
}

export interface MessageGeometry {
  /** `grid-column` of the cell that holds the arrow. */
  gridColumn: string
  /** Ends of the line, in percent of the cell, from its left and from its right edge. */
  left: number
  right: number
  /** Middle of the line, where the label sits. */
  middle: number
  /** Tip of the arrow. */
  head: number
  /** The arrow points to the left. */
  reverse: boolean
  /** The dots of the sender and of the participants the arrow goes through. */
  dots: number[]
}

/**
 * Where the arrow of a `::Message` runs: from the lifeline of `from` to that
 * of `to`, through those of `via`. `undefined` when an id names no participant.
 */
export function messageGeometry(actors: readonly string[], from: string, to: string, via?: string): MessageGeometry | undefined {
  const columns = [from, ...ids(via), to].map(id => actorColumn(actors, id))
  if (columns.includes(undefined))
    return undefined
  const known = columns as number[]
  const start = Math.min(...known)
  const end = Math.max(...known)
  const span = end - start + 1
  const points = known.map(c => (c - start + 0.5) / span * 100)
  const first = points[0] ?? 0
  const last = points.at(-1) ?? first
  return {
    gridColumn: `${start} / ${end + 1}`,
    left: Math.min(first, last),
    right: 100 - Math.max(first, last),
    middle: (first + last) / 2,
    head: last,
    reverse: last < first,
    dots: points.slice(0, -1),
  }
}

/**
 * The fragment at which each participant enters: that of the first row that
 * names it. The participants of the first row are there from the start and
 * take no entry, nor does a participant no row names.
 */
export function entrySteps(rows: readonly { step: string, actors: readonly string[] }[]): Map<string, string> {
  const entries = new Map<string, string>()
  const opening = new Set(rows[0]?.actors)
  for (const row of rows.slice(1)) {
    for (const id of row.actors) {
      if (!opening.has(id) && !entries.has(id))
        entries.set(id, row.step)
    }
  }
  return entries
}

export interface StateCell {
  id: string
  column: number
  value: string
  /** Framed in the color of the state. */
  marked: boolean
}

/**
 * The values of a `::State`, `id=value` separated by `|`, each on the column
 * of its participant. With a color, the values `mark` names are framed in it,
 * all of them when `mark` names none.
 */
export function stateCells(actors: readonly string[], values: string, options: { colored: boolean, mark?: string }): StateCell[] {
  const marked = ids(options.mark)
  return values.split('|').flatMap((entry) => {
    const separator = entry.indexOf('=')
    if (separator < 0)
      return []
    const id = entry.slice(0, separator).trim()
    const column = actorColumn(actors, id)
    if (column === undefined)
      return []
    return [{
      id,
      column,
      value: entry.slice(separator + 1).trim(),
      marked: options.colored && (!marked.length || marked.includes(id)),
    }]
  })
}
