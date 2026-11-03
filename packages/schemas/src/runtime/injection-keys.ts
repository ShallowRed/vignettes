import type { InjectionKey } from 'vue'

// Whether the `::Step` children of a `:::Scheme` are Reveal fragments.
export const SCHEME_FRAGMENTS: InjectionKey<boolean> = Symbol('schemeFragments')

// Whether the `::Step` children of a `:::Scheme` are linked by arrows.
export const SCHEME_ARROWS: InjectionKey<boolean> = Symbol('schemeArrows')

// Card shape of the `::Step` children: pictogram above the text, or beside it.
export const SCHEME_TILES: InjectionKey<'column' | 'row'> = Symbol('schemeTiles')

export interface DiagramNodeRegistration {
  id: string
  el: HTMLElement
  step?: number
}
export type DiagramSide = 'top' | 'right' | 'bottom' | 'left'
export interface DiagramEdgeRegistration {
  from: string
  to: string
  label?: string
  dashed?: boolean
  /** `false` draws the line without its arrowhead, for the leg before a flow box. */
  arrow?: boolean
  step?: number
  /** Forced sides on the two cards, `from,to`; chosen from the geometry when absent. */
  anchors?: [DiagramSide | undefined, DiagramSide | undefined]
  route?: 'curve' | 'orthogonal'
}
export interface DiagramRegistry {
  fragments: boolean
  /** Default card orientation for the `::Node` children. */
  tiles: 'column' | 'row'
  registerNode: (node: DiagramNodeRegistration) => void
  registerEdge: (edge: DiagramEdgeRegistration) => void
}
// Lets `::Node` and `::Edge` children declare themselves to their `:::Diagram`.
export const DIAGRAM: InjectionKey<DiagramRegistry> = Symbol('diagram')

export interface SequenceRegistry {
  /** Ids of the `::Actor` children, in column order. */
  actors: readonly string[]
  registerActor: (id: string) => void
  unregisterActor: (id: string) => void
  registerRow: () => void
  unregisterRow: () => void
}
// Lets the `::Actor` children of a `:::Sequence` take their column, and its rows (`::Message`, `::State`, `::Remark`) be counted.
export const SEQUENCE: InjectionKey<SequenceRegistry> = Symbol('sequence')

export interface JsonTourZoneRegistration {
  el: HTMLElement
  /** Line range highlighted in the file, `12` or `12-24`. */
  lines?: string
  /** Area highlighted on the tour's image, `x,y,w,h` in percent of the image. */
  spot?: string
  step?: number
  /** Words of its lines marked while the zone is current, separated by `|`. */
  mark?: string
  /** Words of its lines underlined while the zone is current, separated by `|`. */
  underline?: string
}
export interface JsonTourRegistry {
  fragments: boolean
  registerZone: (zone: JsonTourZoneRegistration) => void
}
// Lets `::Zone` children declare themselves to their `:::JsonTour`.
export const JSON_TOUR: InjectionKey<JsonTourRegistry> = Symbol('jsonTour')
