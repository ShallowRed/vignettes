import type { ParserId, Slide } from '@vignettes/core/deck'
import type { SlideRenderFailure } from '@vignettes/nuxt/injection-keys'
import { componentMentions, slideRanges } from '@vignettes/core/deck'
import { slidePlace } from '@vignettes/nuxt/slide-map'

/** A component of the preview that threw while it rendered, placed in the text. */
export interface RenderFailureMention {
  name: string
  line: number
  column: number
  length: number
}

/**
 * Places each failure on the component written in its slide at its rank, or
 * on the first line of the slide. A slide outside `slides`, from another
 * render of the page, has no place.
 */
export function renderFailureMentions(text: string, parser: ParserId, slides: readonly Slide[], failures: Iterable<SlideRenderFailure>): RenderFailureMention[] {
  const ranges = slideRanges(text, parser)
  const lines = text.split('\n')
  return [...failures].flatMap((failure) => {
    const place = slidePlace(slides, failure.slide)
    const index = place ? ranges.findIndex(range => range.h === place.h && range.v === place.v) : -1
    if (index < 0)
      return []
    const start = ranges[index]!.startLine
    const end = ranges[index + 1]?.startLine ?? lines.length + 1
    const mention = componentMentions(text, failure.names)
      .filter(found => found.line >= start && found.line < end)[failure.index]
    return [mention
      ? { name: mention.name, line: mention.line, column: mention.column, length: mention.length }
      : { name: failure.names[0] ?? '', line: start, column: 0, length: lines[start - 1]?.length ?? 0 }]
  })
}
