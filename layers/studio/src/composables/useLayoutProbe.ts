import type { EditorState } from '@codemirror/state'
import type { MediaSize } from '@vignettes/core/deck'
import type { PresentationData } from '@vignettes/nuxt/types'
import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { LayoutReading } from '../utils/editor-layout'
import { parserIdFor, slideRanges } from '@vignettes/core/deck'
import { buildPresentationData } from '@vignettes/nuxt/presentation-data'
import { slideAtLine } from '@vignettes/nuxt/slide-map'
import { layoutCandidates } from '../utils/editor-layout'
import { previewSourceReader } from '../utils/preview-header'

/** The hidden render of the layout panel, which measures its slides in their order. */
export interface LayoutProbeInstance { measure: (current: () => boolean) => Promise<LayoutReading[] | undefined> }

/** The measure of the sizes of the media under the cursor, which the editor page gives the layout panel. */
export interface LayoutProbe {
  /** The slides the hidden render shows: the slide under the cursor at each size of its media. */
  data: Readonly<ShallowRef<PresentationData | null>>
  /**
   * Measures each size of the media of the slide under the cursor: an empty
   * record when it has none to measure, `null` when the preview or the hidden
   * render is not there to measure it, none when a later measure began meanwhile.
   */
  measure: (state: EditorState) => Promise<Partial<Record<MediaSize, LayoutReading>> | null | undefined>
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
    const candidates = layoutCandidates(state)
    if (!candidates.length)
      return {}
    if (!metadata)
      return null
    const parser = parserIdFor({ parser: metadata.parser, syntax: metadata.syntax })
    const { h, v } = slideAtLine(slideRanges(state.doc.toString(), parser), state.doc.lineAt(state.selection.main.head).number)
    const read = previewSourceReader()
    const slides = []
    for (const candidate of candidates) {
      const built = await buildPresentationData(read(state.update(candidate.change).state.doc.toString()))
      if (id !== run)
        return undefined
      const top = built.slides[h]
      const slide = v ? top?.verticalSlides?.[v - 1] : top
      if (!slide)
        return null
      slides.push({ ...slide, verticalSlides: undefined, key: candidate.size })
    }
    data.value = { metadata, slides }
    await nextTick()
    const instance = options.instance.value
    if (!instance)
      return null
    const readings = await instance.measure(() => id === run)
    if (id !== run || !readings)
      return undefined
    return Object.fromEntries(candidates.map((candidate, at) => [candidate.size, readings[at]!]))
  }

  return { data, measure }
}
