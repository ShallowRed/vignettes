import type { EditorState } from '@codemirror/state'
import type { PresentationData } from '@vignettes/nuxt/types'
import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { LayoutCandidate, LayoutProposal, LayoutReading } from '../utils/editor-layout'
import { parserIdFor, slideRanges } from '@vignettes/core/deck'
import { buildPresentationData } from '@vignettes/nuxt/presentation-data'
import { slideAtLine } from '@vignettes/nuxt/slide-map'
import { layoutCandidates, proposalSteps } from '../utils/editor-layout'
import { previewSourceReader } from '../utils/preview-header'

/** The hidden render of the layout panel, which measures its slides in their order. */
export interface LayoutProbeInstance { measure: (current: () => boolean) => Promise<LayoutReading[] | undefined> }

/** What the panel learns of the slide under the cursor: the readings of the settings it marks, by their key, and its proposal. */
export interface LayoutMeasure {
  readings: Record<string, LayoutReading>
  proposal?: LayoutProposal
}

/** The measure of the slide under the cursor, which the editor page gives the layout panel. */
export interface LayoutProbe {
  /** The slides the hidden render shows: the slide under the cursor at each setting it measures. */
  data: Readonly<ShallowRef<PresentationData | null>>
  /**
   * Measures the settings the panel marks, then the path of the proposal, one
   * setting at a time: `null` when the preview or the hidden render is not
   * there to measure them, none when a later measure began meanwhile.
   */
  measure: (state: EditorState) => Promise<LayoutMeasure | null | undefined>
}

export const LAYOUT_PROBE: InjectionKey<LayoutProbe> = Symbol('layoutProbe')

/**
 * Each candidate is the whole text after its change, read as the preview reads
 * it, so that the slide keeps its place, its role and its theme; the hidden
 * render shows the slide under the cursor of each.
 */
export function useLayoutProbe(options: {
  preview: Readonly<Ref<PresentationData | null>>
  instance: Readonly<ShallowRef<LayoutProbeInstance | null>>
}): LayoutProbe {
  const data = shallowRef<PresentationData | null>(null)
  let run = 0

  async function measure(state: EditorState) {
    const id = ++run
    const metadata = options.preview.value?.metadata
    if (!metadata)
      return null
    const parser = parserIdFor({ parser: metadata.parser, syntax: metadata.syntax })
    const { h, v } = slideAtLine(slideRanges(state.doc.toString(), parser), state.doc.lineAt(state.selection.main.head).number)
    const read = previewSourceReader()
    const readings: Record<string, LayoutReading> = {}

    /** Renders the candidates in the hidden render and reads each one: false when a later measure began, `null` when the preview or the hidden render is not there. */
    async function render(candidates: readonly LayoutCandidate[]): Promise<boolean | null> {
      const slides = []
      for (const candidate of candidates) {
        const built = await buildPresentationData(read(state.update(candidate.change).state.doc.toString()))
        if (id !== run)
          return false
        const top = built.slides[h]
        const slide = v ? top?.verticalSlides?.[v - 1] : top
        if (!slide)
          return null
        slides.push({ ...slide, verticalSlides: undefined, key: candidate.key })
      }
      data.value = { metadata: metadata!, slides }
      await nextTick()
      const instance = options.instance.value
      if (!instance)
        return null
      const measured = await instance.measure(() => id === run)
      if (id !== run || !measured)
        return false
      candidates.forEach((candidate, at) => readings[candidate.key] = measured[at]!)
      return true
    }

    const { sizes, steps } = layoutCandidates(state)
    const marked = [...new Map([...Object.values(sizes), ...Object.values(steps)].map(found => [found.key, found])).values()]
    if (marked.length) {
      const done = await render(marked)
      if (done !== true)
        return done === null ? null : undefined
    }
    const path = proposalSteps(state)
    let step = path.next()
    while (!step.done) {
      if (!readings[step.value.key]) {
        const done = await render([step.value])
        if (done !== true)
          return done === null ? null : undefined
      }
      step = path.next(readings[step.value.key]!)
    }
    return { readings, proposal: step.value }
  }

  return { data, measure }
}
