import type { ComputedRef, InjectionKey } from 'vue'

// Carries the deck's frontmatter `storybook` root URL to <StoryFrame>/<Screens> so they resolve story ids.
export const STORYBOOK_BASE: InjectionKey<ComputedRef<string | undefined>>
  = Symbol('storybookBase')

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

export interface JsonTourZoneRegistration {
  el: HTMLElement
  /** Line range highlighted in the file, `12` or `12-24`. */
  lines?: string
  step?: number
}
export interface JsonTourRegistry {
  fragments: boolean
  registerZone: (zone: JsonTourZoneRegistration) => void
}
// Lets `::Zone` children declare themselves to their `:::JsonTour`.
export const JSON_TOUR: InjectionKey<JsonTourRegistry> = Symbol('jsonTour')
