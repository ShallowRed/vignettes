/**
 * reveal.js ships no type declarations. `RevealApi` lists the members this
 * package and its hosts call, and `useReveal` types its instance with it, so a
 * call to a member that is not listed here fails the type check.
 */
declare module 'reveal.js' {
  export interface RevealApi {
    initialize: () => Promise<void>
    destroy: () => void
    sync: () => void
    layout: () => void
    syncSlide: (slide: Element) => void
    configure: (config: Record<string, unknown>) => void
    toggleOverview: () => void
    getPlugin: (id: string) => { open?: () => void } | undefined
    addKeyBinding: (binding: { keyCode: number, key: string, description: string }, callback: () => void) => void
    slide: (h: number, v?: number, f?: number) => void
    getIndices: () => { h: number, v: number, f?: number }
    getConfig: () => Record<string, unknown>
    getSlidesElement: () => HTMLElement
    on: (type: string, listener: (event: any) => void) => void
    off: (type: string, listener: (event: any) => void) => void
  }
  const Reveal: new (element: Element, config?: Record<string, unknown>) => RevealApi
  export default Reveal
}

declare module 'reveal.js/plugin/notes/notes.esm.js' {
  const RevealNotes: () => { id: string }
  export default RevealNotes
}
