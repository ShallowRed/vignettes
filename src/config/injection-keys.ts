import type { ComputedRef, InjectionKey } from 'vue'

// Carries the deck's frontmatter `storybook` root URL to <StoryFrame>/<Screens> so they resolve story ids.
export const STORYBOOK_BASE: InjectionKey<ComputedRef<string | undefined>>
  = Symbol('storybookBase')

// Whether the `::Step` children of a `:::Scheme` are Reveal fragments.
export const SCHEME_FRAGMENTS: InjectionKey<boolean> = Symbol('schemeFragments')

// Whether the `::Step` children of a `:::Scheme` are linked by arrows.
export const SCHEME_ARROWS: InjectionKey<boolean> = Symbol('schemeArrows')

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
  step?: number
  /** Forced sides on the two cards, `from,to`; chosen from the geometry when absent. */
  anchors?: [DiagramSide | undefined, DiagramSide | undefined]
  route?: 'curve' | 'orthogonal'
}
export interface DiagramRegistry {
  fragments: boolean
  registerNode: (node: DiagramNodeRegistration) => void
  registerEdge: (edge: DiagramEdgeRegistration) => void
}
// Lets `::Node` and `::Edge` children declare themselves to their `:::Diagram`.
export const DIAGRAM: InjectionKey<DiagramRegistry> = Symbol('diagram')
