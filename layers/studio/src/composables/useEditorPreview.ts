import type { ComponentMention, DeckProblem } from '@vignettes/core/deck'
import type { PresentationData } from '@vignettes/nuxt/types'
import type { RevealApi } from 'reveal.js'
import type { Ref, ShallowRef } from 'vue'
import type { Translate } from '../config/editor-reference'
import type { LineProblem } from '../utils/editor-problems'
import type { useDocsAddress } from './useDocsAddress'
import { completionStatus } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { checkDeck, componentMentions, deckRevealOptions, parserIdFor, slideRanges, splitFrontmatter, valueMentions } from '@vignettes/core/deck'
import { getDefaultTheme, getThemeTokens } from '@vignettes/core/theme'
import { buildPresentationData } from '@vignettes/nuxt/presentation-data'
import { fragmentAtLine, slideAtLine, unknownDeckComponents } from '@vignettes/nuxt/slide-map'
import { listedFrontmatterProblems } from '../utils/editor-frontmatter'
import { editorIssues } from '../utils/editor-issues'
import { jsonBlockAt } from '../utils/editor-json'
import { placeProblems, setPreviewProblems } from '../utils/editor-problems'
import { previewSourceReader } from '../utils/preview-header'
import { imageMention, missingImages } from '../utils/preview-images'
import { OVERFLOW_THRESHOLD, slideOverflow, transitionsEnded } from '../utils/preview-overflow'
import { useTrial } from './useTrial'

/** The Reveal component of the preview. */
export interface PreviewInstance { slide: (h: number, v?: number, f?: number) => void, sync: () => void, getInstance: () => RevealApi | null }

interface EditorPreviewOptions {
  /** The template refs of the page: the slide frame, and the Reveal component in it. */
  previewFrame: Readonly<ShallowRef<HTMLElement | null>>
  previewInstance: Readonly<ShallowRef<PreviewInstance | null>>
  /** The text in the editor. */
  raw: Ref<string>
  /** The text the page loaded, which gives the slide proportions before the first parse. */
  loadedText: string
  editorView: Ref<EditorView | undefined>
  /** Themes compiled with other theme packages than this studio's. */
  staleThemes: Ref<string[]>
  docsUrl: ReturnType<typeof useDocsAddress>
  t: Translate
  /** `t` with the shortcut of the suggestions, for the messages that name it. */
  tWithKeys: Translate
  /** The interface language, for the texts of the deck contract. */
  locale: Readonly<Ref<string>>
}

const FRAGMENT_STEPS_KEY = 'vignettes:editor-fragment-steps'

/**
 * The live preview of the editor: the text reparsed through the pipeline of the
 * deck routes once the typing pauses, the problems that parse found, the slide
 * that follows the caret with its fragments, and the measure of the slide on
 * screen.
 */
export function useEditorPreview(options: EditorPreviewOptions) {
  const { raw, editorView, staleThemes, t, tWithKeys, locale } = options

  const { previewFrame, previewInstance: previewRef } = options
  const previewHasFocus = () => previewFrame.value?.matches(':focus-within') ?? false

  const preview = ref<PresentationData | null>(null)
  // Before the first parse, the frontmatter of the text names the parser.
  const parserId = computed(() => preview.value
    ? parserIdFor({ parser: preview.value.metadata?.parser, syntax: preview.value.metadata?.syntax })
    : parserIdFor(splitFrontmatter(raw.value).data))

  // ── Follow the caret ───────────────────────────────────────────────────────
  // The preview navigates to the slide the caret sits in: `slideRanges` of
  // `@vignettes/core` gives the boundaries the renderer uses, and Reveal's
  // slide(h, v) opens the slide under the caret.
  const followCursor = ref(true)
  const cursorLine = ref(1)
  const cursorPos = ref(0)

  // Fragments in the preview: the slide in its final state (every fragment shown),
  // or opened at the fragment under the caret and stepped with the preview's arrows
  // as in the deck. The choice is kept per browser.
  const fragmentSteps = ref(false)
  onMounted(() => {
    try {
      fragmentSteps.value = localStorage.getItem(FRAGMENT_STEPS_KEY) === '1'
    }
    catch {}
  })

  function toggleFragmentSteps() {
    fragmentSteps.value = !fragmentSteps.value
    try {
      localStorage.setItem(FRAGMENT_STEPS_KEY, fragmentSteps.value ? '1' : '0')
    }
    catch {}
  }

  // A deck whose frontmatter turns fragments off shows them all in both modes.
  const previewFragments = computed(() => fragmentSteps.value && preview.value?.metadata?.reveal?.fragments !== false)

  watch(previewFragments, (fragments) => {
    previewRef.value?.getInstance()?.configure({ fragments })
    syncPreviewToCursor()
    readSteps()
  })

  // The steps of the slide on screen: the button shows on a slide that has some,
  // and the stepped preview gives the step reached. Fragments that share an index
  // are one step.
  const slideSteps = ref(0)
  const stepShown = ref(0)
  let stepsSource: RevealApi | null = null
  function readSteps() {
    const reveal = previewRef.value?.getInstance()
    const slide = reveal?.getCurrentSlide()
    if (!reveal || !slide) {
      slideSteps.value = 0
      return
    }
    const fragments = [...slide.querySelectorAll<HTMLElement>('.fragment')]
    slideSteps.value = new Set(fragments.map((fragment, at) => fragment.dataset.fragmentIndex ?? `#${at}`)).size
    stepShown.value = (reveal.getIndices().f ?? -1) + 1
  }

  function onPreviewReady() {
    const reveal = previewRef.value?.getInstance()
    if (reveal && reveal !== stepsSource) {
      for (const event of ['slidechanged', 'fragmentshown', 'fragmenthidden'])
        reveal.on(event, readSteps)
      stepsSource = reveal
    }
    syncPreviewToCursor()
    readSteps()
  }

  // While the author edits a text on the slide, the preview keeps the render
  // the text is typed in: no parse, no result applied, no move to the caret.
  let holds = 0

  function syncPreviewToCursor() {
    if (holds > 0)
      return
    checkSlide()
    if (!followCursor.value || !previewRef.value)
      return
    const ranges = slideRanges(raw.value, parserId.value)
    const { h, v } = slideAtLine(ranges, cursorLine.value)
    // Stepped fragments open the slide at the fragment under the caret.
    if (previewFragments.value)
      previewRef.value.slide(h, v, fragmentAtLine(raw.value, ranges, cursorLine.value))
    else
      previewRef.value.slide(h, v)
  }

  // The slide on screen, measured once the preview settles: its content that
  // reaches below the slide, by its first line, since the presentation and the
  // PDF cut it there; and its images that fail to load, by their written address.
  const overflow = ref<{ line: number, slide: number } | null>(null)
  const brokenImages = ref<{ src: string, line: number, column: number, length: number }[]>([])
  let slideTimer: ReturnType<typeof setTimeout> | undefined
  let slideCheck = 0
  function checkSlide() {
    clearTimeout(slideTimer)
    if (holds > 0)
      return
    slideTimer = setTimeout(async () => {
      const reveal = previewRef.value?.getInstance()
      if (!reveal)
        return
      const check = ++slideCheck
      await transitionsEnded(reveal)
      if (check !== slideCheck)
        return
      const { h, v } = reveal.getIndices()
      const ranges = slideRanges(raw.value, parserId.value)
      const index = ranges.findIndex(range => range.h === h && range.v === (v ?? 0))
      const startLine = ranges[index]?.startLine
      overflow.value = startLine && slideOverflow(reveal) > OVERFLOW_THRESHOLD ? { line: startLine, slide: index + 1 } : null
      const missing = startLine ? await missingImages(reveal) : []
      if (check !== slideCheck)
        return
      const mentions = valueMentions(raw.value)
      brokenImages.value = missing.flatMap((src) => {
        const mention = imageMention(mentions, src, startLine!)
        return mention ? [{ src, line: mention.line, column: mention.column, length: mention.length }] : []
      })
    }, 400)
  }

  // Track the caret line; re-sync only when it crosses into another line (typing
  // within a line shouldn't re-navigate). A click in the preview selects the
  // source of the slide on screen, which stays at its step.
  const cursorListener = EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged)
      return
    cursorPos.value = update.state.selection.main.head
    const line = update.state.doc.lineAt(update.state.selection.main.head).number
    const moved = line !== cursorLine.value
    cursorLine.value = line
    if (moved && !update.transactions.some(transaction => transaction.isUserEvent('select.preview')))
      syncPreviewToCursor()
  })

  watch(followCursor, (on) => {
    if (on)
      syncPreviewToCursor()
  })

  // The slide under the caret, where "Présenter" opens the deck.
  const cursorSlide = computed(() => slideAtLine(slideRanges(raw.value, parserId.value), cursorLine.value))
  const cursorSlideHash = computed(() => `#/${cursorSlide.value.h}/${cursorSlide.value.v}`)
  const slideCount = computed(() => slideRanges(raw.value, parserId.value).length)
  // Whether the caret is in a `json` block, where the status bar shows the indent button.
  const cursorInJson = computed(() => Boolean(jsonBlockAt(raw.value, cursorPos.value)))
  const cursorSlideNumber = computed(() =>
    slideRanges(raw.value, parserId.value).findIndex(range => range.h === cursorSlide.value.h && range.v === cursorSlide.value.v) + 1)

  // The slide proportions, so the preview frame matches the deck. Before the first
  // parse, the server render included, they come from the loaded text: its theme's
  // Reveal settings, then its own `reveal:`.
  const loadedReveal = computed(() => {
    const meta = splitFrontmatter(options.loadedText).data
    const theme = typeof meta.theme === 'string' ? meta.theme : getDefaultTheme()
    return { ...getThemeTokens(theme)?.reveal, ...deckRevealOptions(meta.reveal) }
  })
  const previewRatio = computed(() => {
    const reveal = (preview.value?.metadata?.reveal ?? loadedReveal.value) as { width?: number, height?: number }
    return (reveal.width ?? 960) / (reveal.height ?? 700)
  })

  // ── Reparse ────────────────────────────────────────────────────────────────
  // The same parse path as the live routes guarantees fidelity.

  // What the last parse found: the problems of the frontmatter, the components
  // no registered component answers to, which the deck draws as plain content,
  // the attributes the deck refuses or whose address the page does not load, or
  // a failure after which the preview keeps the last good render.
  const frontmatterIssues = ref<Array<LineProblem & { short: string }>>([])
  const unknownMentions = ref<ComponentMention[]>([])
  const deckProblems = ref<DeckProblem[]>([])
  const parseFailed = ref(false)
  let parsedText = ''
  // The parses that ended, applied or failed, and the return of the text the
  // preview draws; a parse that a newer one or a hold dropped does not count.
  const parseRun = ref(0)
  let generation = 0
  // The text and the stale themes of the last parse that ended, so that the
  // pause after an edit on the slide does not parse that text again.
  let parsedKey = ''
  const parseKey = () => `${raw.value}\u0000${staleThemes.value.join(',')}`
  // The text the preview draws, whose slides carry the source ranges.
  const renderedText = ref('')
  // From a change of the text to the render of its preview, a bar runs along the
  // top of the slide.
  const previewPending = ref(false)
  // Whether a parse of the text has ended: before it, an empty preview says
  // nothing about the deck.
  const previewParsed = ref(false)

  // The frontmatter guide marks its own problems in the source pane; the list
  // shows them with the others, the most severe first.
  const previewIssues = computed(() => editorIssues(raw.value, {
    overflow: overflow.value,
    brokenImages: brokenImages.value,
    frontmatter: frontmatterIssues.value,
    unknown: unknownMentions.value,
    deck: deckProblems.value,
  }, t, locale.value, options.docsUrl))

  const previewSource = previewSourceReader()
  // The source positions, which the click and the edit on the slide read, are
  // on trial: without them, no element of the preview answers.
  const sourcePositions = useTrial('edit-on-slide')

  async function reparse() {
    const text = raw.value
    const key = parseKey()
    const run = ++generation
    try {
      const source = previewSource(text)
      const data = await buildPresentationData(source, { sourcePositions: sourcePositions.value })
      if (run !== generation)
        return
      preview.value = data
      renderedText.value = source
      parsedKey = key
      parseRun.value++
      unknownMentions.value = componentMentions(text, unknownDeckComponents(data))
      deckProblems.value = checkDeck(text)
      frontmatterIssues.value = listedFrontmatterProblems(text, tWithKeys, staleThemes.value)
      parseFailed.value = false
      parsedText = text
      // Let Reveal register added/removed slides, then re-align to the caret so a
      // freshly-typed slide is reachable by the follow-cursor sync.
      await nextTick()
      previewRef.value?.sync?.()
      syncPreviewToCursor()
      readSteps()
    }
    catch {
      if (run !== generation)
        return
      parseFailed.value = true
      parsedKey = key
      parseRun.value++
    }
    // A text typed during the parse keeps the bar until its own render.
    if (raw.value === text) {
      previewPending.value = false
      previewParsed.value = true
    }
  }

  // The marks go to the text that was parsed; a text typed since then gets its
  // own parse.
  watch([previewIssues, editorView], ([issues, view]) => {
    if (!view || view.state.doc.toString() !== parsedText)
      return
    const problems = issues.filter(issue => !issue.marked)
    view.dispatch({ effects: setPreviewProblems.of(placeProblems(view.state, problems)) })
  })

  // The preview renders again once the typing pauses, and waits while the list of
  // suggestions is open, so that the list answers the keys at once.
  let timer: ReturnType<typeof setTimeout> | null = null
  function scheduleReparse() {
    if (timer)
      clearTimeout(timer)
    if (holds > 0)
      return
    timer = setTimeout(() => {
      const view = editorView.value
      if (view && completionStatus(view.state) === 'active') {
        scheduleReparse()
      }
      // The text of the last parse came back: a parse under way is dropped.
      else if (parseKey() === parsedKey) {
        generation++
        previewPending.value = false
        parseRun.value++
      }
      else {
        reparse()
      }
    }, 300)
  }

  watch([raw, staleThemes], () => {
    previewPending.value = true
    scheduleReparse()
  }, { immediate: true })

  /**
   * Holds the preview as it is, and gives the function that releases it. Once
   * the last hold ends, the preview parses at once a text it has not drawn.
   */
  function holdPreview(): () => void {
    holds++
    if (timer)
      clearTimeout(timer)
    clearTimeout(slideTimer)
    // A parse under way is dropped.
    generation++
    let held = true
    return () => {
      if (!held)
        return
      held = false
      holds--
      if (holds > 0)
        return
      if (previewPending.value || raw.value !== parsedText)
        reparse()
      else
        checkSlide()
    }
  }

  onBeforeUnmount(() => {
    clearTimeout(slideTimer)
    if (timer)
      clearTimeout(timer)
  })

  return {
    preview,
    renderedText,
    parseRun,
    holdPreview,
    parserId,
    previewHasFocus,
    previewRatio,
    previewPending,
    previewParsed,
    previewIssues,
    parseFailed,
    previewFragments,
    fragmentSteps,
    toggleFragmentSteps,
    slideSteps,
    stepShown,
    followCursor,
    cursorListener,
    cursorSlideHash,
    cursorSlideNumber,
    slideCount,
    cursorInJson,
    onPreviewReady,
  }
}
