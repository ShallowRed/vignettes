import type { ParserId } from '@vignettes/core/deck'
import type { Ref } from 'vue'
import { EditorView } from '@codemirror/view'
import { slideRanges } from '@vignettes/core/deck'
import { watch } from 'vue'

interface SlideTargetOptions {
  /** The `h/v` of the slide to open, from the `slide` query of the page. */
  target: unknown
  view: Readonly<Ref<EditorView | undefined>>
  /** Whether the view holds the text of the deck. */
  ready: Readonly<Ref<boolean>>
  parser: Readonly<Ref<ParserId>>
  /** Called once the caret is on the slide, with its number and the number of slides. */
  opened: (slide: number, total: number) => void
}

/**
 * `?slide=h/v`: the deck page's edit command opens the editor on the slide it
 * showed. The caret goes to the first line of the slide once the view holds
 * the text.
 */
export function useSlideTarget(options: SlideTargetOptions) {
  const target = typeof options.target === 'string' ? options.target.split('/').map(Number) : []
  if (!target.length || !target.every(Number.isInteger))
    return

  const stop = watch(options.ready, (ready) => {
    const view = options.view.value
    if (!ready || !view)
      return
    stop()
    const [h, v = 0] = target
    const ranges = slideRanges(view.state.doc.toString(), options.parser.value)
    const index = ranges.findIndex(range => range.h === h && range.v === v)
    if (index === -1)
      return
    const line = view.state.doc.line(ranges[index]!.startLine)
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 48 }) })
    view.focus()
    options.opened(index + 1, ranges.length)
  })
}
