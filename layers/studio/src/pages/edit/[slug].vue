<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
/**
 * Integrated Markdown editor.
 *
 * Split view: a CodeMirror markdown pane (the deck's raw source) on the left, a
 * LIVE reveal preview on the right that reparses as you type through the SAME
 * pipeline the deck routes use (`buildPresentationData` → RevealPresentation) —
 * so the preview is exactly what the published deck renders, no second parser.
 *
 * The pane loads DRAFT-first (`?draft`): the editor must show what "Enregistrer"
 * saved, not the published version. Saving persists the draft through
 * `PUT /api/presentations/:slug`; publishing stays a separate explicit act.
 * Markdown stays the source of truth.
 */
import type { Extension } from '@codemirror/state'
import type { AttributeMention, ComponentMention } from '@vignettes/core/deck'
import type { PresentationData } from '@vignettes/nuxt/types'
import type { RevealApi } from 'reveal.js'
import type { LineProblem } from '../../utils/editor-problems'
import { STATUS_CONFIG } from '#shared/presentations'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import { useQuery } from '@pinia/colada'
import { attributeMentions, componentMentions, deckRevealOptions, parserIdFor, slideRanges, splitFrontmatter } from '@vignettes/core/deck'
import { getDefaultTheme, getThemeTokens } from '@vignettes/core/theme'
import { buildPresentationData } from '@vignettes/nuxt/presentation-data'
import { fragmentAtLine, slideAtLine, unknownDeckComponents } from '@vignettes/nuxt/slide-map'
import Codemirror from 'vue-codemirror6'
import { useAppSession } from '../../composables/useAppSession'
import { useEditorImageUpload } from '../../composables/useEditorImageUpload'
import { projectsQuery } from '../../queries'
import { CODE_LANGUAGES } from '../../utils/editor-code-languages'
import { insertSnippet, wrapSelection } from '../../utils/editor-commands'
import { deckCompletions } from '../../utils/editor-completions'
import { listedFrontmatterProblems } from '../../utils/editor-frontmatter'
import { formatJson, jsonFormatNotice } from '../../utils/editor-json'
import { editorKeymap } from '../../utils/editor-keymap'
import { placeProblems, previewProblemMarks, setPreviewProblems } from '../../utils/editor-problems'
import { deckStructure } from '../../utils/editor-slides'
import { editorTheme } from '../../utils/editor-theme'
import { wrappedLines } from '../../utils/editor-wrap'
import { requestErrorMessage } from '../../utils/request-error'
import { saveTextFile } from '../../utils/save-file'

const { t, locale } = useI18n()

definePageMeta({ layout: false })

const route = useRoute()
const slug = route.params.slug as string
// Real-time collaboration is the default: every writer of a deck edits the same
// CRDT document. `?solo` opts out: a plain CodeMirror editor with explicit,
// conflict-checked saves.
const soloRequested = computed(() => 'solo' in route.query)

const { privileged, user } = useAppSession()
const colorMode = useColorMode()
const toast = useToast()

const raw = ref('')
const lastSaved = ref('')
const deckTitle = ref<string | undefined>(undefined)
useHead({ title: () => t('editor.page.pageTitle', { title: deckTitle.value || slug }) })
const deckStatus = ref<string>('private')
const loadedFrom = ref<'draft' | 'published' | 'file' | null>(null)
const preview = ref<PresentationData | null>(null)
const loadErrorStatus = ref<number | null>(null)
const loadError = computed(() => loadErrorStatus.value !== null)

/**
 * The screen for a deck that did not load, chosen by status: an expired session
 * is sent to sign in and back, a reader who may open the deck is sent to it, a
 * deck that is absent or closed to this account says so in one text, and any
 * other failure says that the load failed.
 */
const refusal = computed(() => {
  switch (loadErrorStatus.value) {
    case 401:
      return { icon: 'i-lucide-lock', title: t('editor.page.signInTitle'), description: t('editor.page.signInMessage'), actions: [{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: `/login?redirect=${encodeURIComponent(`/edit/${slug}`)}` }] }
    case 403:
      return { icon: 'i-lucide-eye', title: t('editor.page.readOnlyTitle'), description: t('editor.page.readOnlyMessage'), actions: [{ label: t('editor.page.openDeck'), icon: 'i-lucide-play', to: `/slides/${slug}` }] }
    case 404:
      return { icon: 'i-lucide-file-question', title: t('editor.page.notFoundTitle'), description: t('editor.page.notFoundMessage') }
    default:
      return { icon: 'i-lucide-triangle-alert', title: t('editor.page.failedTitle'), description: t('editor.page.failedMessage') }
  }
})
const saveState = ref<'idle' | 'saving' | 'error'>('idle')

// Collaboration state. `peers` lists the other connected people by name.
const collabStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting')
const peerCount = ref(0)
const peers = ref<{ name: string, color: string }[]>([])

// Load the working draft (falls back to published version, then file).
// useRequestFetch: the SSR pass must re-emit the session cookie — `?draft`
// requires edit rights, so an anonymous internal fetch would 401.
const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData(`edit-${slug}`, () =>
  requestFetch<{ content: string, status?: string, title?: string, from?: 'draft' | 'published' | 'file', writable?: boolean, stamp?: number | null, publishedRaw?: string | null, publishedAt?: number | null }>(
    `/api/presentations/${slug}`,
    { query: { draft: '' } },
  ))

const writable = computed(() => data.value?.writable !== false)
const collabEnabled = computed(() => writable.value && !soloRequested.value)
// In solo mode the draft is only "unsaved" when it differs from what the server has.
const dirty = computed(() => !collabEnabled.value && raw.value !== lastSaved.value)
// Solo concurrency token: the draft stamp we loaded, echoed on save so the
// server refuses to overwrite someone else's newer draft (409).
const draftStamp = ref<number | null | undefined>(undefined)

// Publication state: the served text, to tell whether the draft holds changes
// the visitors do not see yet. Unknown (null) until the collab document synced.
const publishedRaw = ref<string | null>(null)
const publishedAt = ref<number | null>(null)
const docSynced = ref(false)
const synced = ref(true)
const neverPublished = computed(() => publishedRaw.value === null)
const unpublished = computed<boolean | null>(() => {
  if (collabEnabled.value && !docSynced.value)
    return null
  if (neverPublished.value)
    return true
  return raw.value !== publishedRaw.value
})
const publishedAtLabel = computed(() =>
  publishedAt.value ? new Date(publishedAt.value).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' }) : null)
const publicationLabel = computed(() =>
  neverPublished.value ? t('editor.publication.neverPublished') : unpublished.value ? t('editor.publication.unpublishedChanges') : t('editor.publication.upToDate'))
const publishLabel = computed(() =>
  unpublished.value === false ? t('editor.publication.published') : t('editor.publication.publish'))
const publicationHint = computed(() => {
  if (neverPublished.value)
    return t('editor.publication.hintNeverPublished')
  const date = publishedAtLabel.value
  if (unpublished.value)
    return date ? t('editor.publication.hintUnpublishedSince', { date }) : t('editor.publication.hintUnpublished')
  return date ? t('editor.publication.hintUpToDateSince', { date }) : t('editor.publication.hintUpToDate')
})
const collabLabel = computed(() => {
  if (collabStatus.value === 'disconnected')
    return t('editor.collab.offline')
  if (collabStatus.value !== 'connected' || !docSynced.value)
    return t('editor.collab.connecting')
  return synced.value ? t('editor.collab.synced') : t('editor.collab.saving')
})

// The server acknowledges each keystroke within a moment; the indicator shows
// the pending state only when it lasts, so it stays still while someone types.
const SAVING_DELAY_MS = 1200
const savingShown = ref(false)
let savingTimer: ReturnType<typeof setTimeout> | undefined
watch(synced, (value) => {
  clearTimeout(savingTimer)
  if (value)
    savingShown.value = false
  else
    savingTimer = setTimeout(() => savingShown.value = true, SAVING_DELAY_MS)
})
const syncIndicator = computed(() => {
  if (collabStatus.value === 'disconnected')
    return { icon: 'i-lucide-cloud-off', class: 'text-error', label: collabLabel.value }
  if (collabStatus.value !== 'connected' || !docSynced.value)
    return { icon: 'i-lucide-loader-circle', class: 'text-dimmed animate-spin', label: collabLabel.value }
  if (savingShown.value)
    return { icon: 'i-lucide-cloud-upload', class: 'text-warning', label: t('editor.collab.saving') }
  return { icon: 'i-lucide-cloud-check', class: 'text-muted', label: t('editor.collab.synced') }
})

/** Re-read the published state after someone (maybe this client) published. */
async function refreshPublished() {
  const res = await $fetch<{ publishedRaw?: string | null, publishedAt?: number | null }>(`/api/presentations/${slug}`, { query: { draft: '' } })
  publishedRaw.value = res.publishedRaw ?? null
  publishedAt.value = res.publishedAt ?? null
}

function initials(name: string): string {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('')
}

if (error.value) {
  // The status alone, never the message of the request: it names the route and
  // repeats the slug, and a reader who may not open the deck should not learn
  // from it whether the deck exists.
  loadErrorStatus.value = (error.value as any)?.statusCode ?? 0
}
else if (data.value) {
  deckStatus.value = data.value.status ?? 'private'
  deckTitle.value = data.value.title
  loadedFrom.value = data.value.from ?? null
  // Solo mode seeds the editor from the fetched markdown. In collab mode the
  // Y.Text is the ONLY source — seeded server-side — so we must NOT also push
  // this content in, or yCollab would duplicate it (one deck → N).
  if (!collabEnabled.value) {
    raw.value = data.value.content
    lastSaved.value = data.value.content
  }
  draftStamp.value = data.value.stamp ?? null
  publishedRaw.value = data.value.publishedRaw ?? null
  publishedAt.value = data.value.publishedAt ?? null
}

const statusDisplay = computed(() => STATUS_CONFIG[deckStatus.value as keyof typeof STATUS_CONFIG])

// The folder of the deck, for the path back in the header.
const { data: viewer } = useFetch<{ canEdit: boolean, project?: string | null }>(() => `/api/presentations/${slug}/viewer`, {
  server: false,
  lazy: true,
  default: () => ({ canEdit: false }),
})

// ── CodeMirror setup ────────────────────────────────────────────────────────

const cm = useTemplateRef<{ view?: EditorView }>('cm')
const editorView = computed(() => cm.value?.view)

// ── Follow-the-cursor preview ────────────────────────────────────────────────
// The preview navigates to the slide the caret sits in: `slideRanges` of
// `@vignettes/core` gives the boundaries the renderer uses, and Reveal's
// slide(h, v) opens the slide under the caret.
// Key must NOT be "preview": a `ref="preview"` would collide with the `preview`
// data ref above, and Vue would overwrite it with the component instance on
// mount — nuking `preview.value.slides`/`.metadata` and crashing every downstream
// computed. Hence the distinct "previewInstance" key.
const previewFrame = useTemplateRef<HTMLElement>('previewFrame')
const previewHasFocus = () => previewFrame.value?.matches(':focus-within') ?? false
const previewRef = useTemplateRef<{ slide: (h: number, v?: number, f?: number) => void, sync: () => void, getInstance: () => RevealApi | null }>('previewInstance')
const followCursor = ref(true)
const cursorLine = ref(1)
const parserId = computed(() => parserIdFor({ parser: preview.value?.metadata?.parser }))

// Fragments in the preview: the slide in its final state (every fragment shown),
// or opened at the fragment under the caret and stepped with the preview's arrows
// as in the deck. The choice is kept per browser.
const FRAGMENT_STEPS_KEY = 'vignettes:editor-fragment-steps'
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
})

function syncPreviewToCursor() {
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

// Track the caret line; re-sync only when it crosses into another line (typing
// within a line shouldn't re-navigate).
const cursorListener = EditorView.updateListener.of((update) => {
  if (!update.selectionSet && !update.docChanged)
    return
  const line = update.state.doc.lineAt(update.state.selection.main.head).number
  const moved = line !== cursorLine.value
  cursorLine.value = line
  if (moved)
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
const cursorSlideNumber = computed(() =>
  slideRanges(raw.value, parserId.value).findIndex(range => range.h === cursorSlide.value.h && range.v === cursorSlide.value.v) + 1)

// `?slide=h/v`: the deck page's edit command opens the editor on the slide it
// showed. The caret goes to the slide's first line once the text is loaded.
const slideTarget = typeof route.query.slide === 'string' ? route.query.slide.split('/').map(Number) : []
let slideTargetPending = slideTarget.length > 0 && slideTarget.every(Number.isInteger)
watch([raw, editorView], async ([text, view]) => {
  if (!slideTargetPending || !view || !text)
    return
  await nextTick()
  const ranges = slideRanges(text, parserIdFor(splitFrontmatter(text).data))
  const [h, v = 0] = slideTarget
  const index = ranges.findIndex(range => range.h === h && range.v === v)
  if (index === -1 || view.state.doc.lines < ranges[index]!.startLine)
    return
  slideTargetPending = false
  const line = view.state.doc.line(ranges[index]!.startLine)
  view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 48 }) })
  view.focus()
  toast.add({ title: t('editor.page.openedOnSlide', { slide: index + 1, total: ranges.length }), icon: 'i-lucide-pencil' })
}, { immediate: true })

function toggleFollow() {
  followCursor.value = !followCursor.value
}

const shortcutKeymap = keymap.of([
  {
    key: 'Mod-b',
    run: (view) => {
      wrapSelection(view, '**', t('editor.placeholders.text'))
      return true
    },
  },
  {
    key: 'Mod-i',
    run: (view) => {
      wrapSelection(view, '*', t('editor.placeholders.text'))
      return true
    },
  },
  {
    key: 'Mod-Alt-l',
    run: (view) => {
      const notice = jsonFormatNotice(formatJson(view), t)
      if (notice)
        toast.add({ ...notice, icon: 'i-lucide-braces' })
      return true
    },
  },
  {
    key: 'Mod-s',
    run: () => {
      if (!collabEnabled.value)
        save()
      return true
    },
  },
  {
    key: 'Alt-z',
    run: () => {
      toggleWrap()
      return true
    },
  },
])

const { imageUploadHandlers, uploadImages } = useEditorImageUpload(writable, slug)

function uploadChosenImages(files: File[]) {
  if (editorView.value)
    uploadImages(editorView.value, files)
}

// Appended by startCollab (yCollab + remote-caret styling + Yjs undo keymap).
const collabExtensions = shallowRef<Extension[]>([])

// Project slugs feed the frontmatter completion. Shares the catalog's `projects`
// query cache (same key) so navigating from the catalog needs no extra fetch.
const { data: projectsData } = useQuery(projectsQuery(requestFetch))
const projects = computed<Project[]>(() => projectsData.value ?? [])

// The header buttons show their label from the `sm` width; below it they keep
// their icon, with the padding of an icon button, and their tooltip and
// accessible name carry the label.
const HEADER_LABEL = 'hidden sm:inline'
const HEADER_BUTTON_UI = { base: 'max-sm:px-1.5', label: HEADER_LABEL }

const breadcrumb = computed(() => {
  const project = projects.value.find(p => p.slug === viewer.value.project)
  return [
    { label: t('common.home'), to: '/' },
    ...(project ? [{ label: project.title, to: `/projects/${project.slug}` }] : []),
    { label: deckTitle.value || slug },
  ]
})

// The slide proportions, so the preview frame matches the deck. Before the first
// parse, the server render included, they come from the loaded text: its theme's
// Reveal settings, then its own `reveal:`.
const loadedReveal = computed(() => {
  const meta = splitFrontmatter(data.value?.content ?? '').data
  const theme = typeof meta.theme === 'string' ? meta.theme : getDefaultTheme()
  return { ...getThemeTokens(theme)?.reveal, ...deckRevealOptions(meta.reveal) }
})
const previewRatio = computed(() => {
  const reveal = (preview.value?.metadata?.reveal ?? loadedReveal.value) as { width?: number, height?: number }
  return (reveal.width ?? 960) / (reveal.height ?? 700)
})

// On by default, so a paragraph stays in the pane; a wrapped line continues
// under its own text. The choice is kept per browser.
const WRAP_LINES_KEY = 'vignettes:editor-wrap-lines'
const wrapLines = ref(true)
onMounted(() => {
  try {
    wrapLines.value = localStorage.getItem(WRAP_LINES_KEY) !== '0'
  }
  catch {}
})

watch(wrapLines, (wrap) => {
  try {
    localStorage.setItem(WRAP_LINES_KEY, wrap ? '1' : '0')
  }
  catch {}
})

function toggleWrap() {
  wrapLines.value = !wrapLines.value
}

const extensions = computed<Extension[]>(() => [
  markdown({ codeLanguages: CODE_LANGUAGES }),
  ...(wrapLines.value ? [wrappedLines()] : []),
  highlightActiveLine(),
  ...deckStructure(t),
  ...editorTheme(colorMode.value === 'dark' ? 'dark' : 'light'),
  deckCompletions({ projects: projects.value.map(p => p.slug), lang: locale.value }, t),
  previewProblemMarks(),
  cursorListener,
  shortcutKeymap,
  imageUploadHandlers,
  // Yjs owns undo in collab mode; the local history would fight it.
  ...(collabEnabled.value ? collabExtensions.value : [history(), keymap.of(historyKeymap)]),
  editorKeymap(),
  keymap.of(defaultKeymap),
])

// In collab mode the Y.Text owns the document, so we DON'T use v-model (it would
// fight Yjs). `cmModel` is only bound in solo mode.
const cmModel = computed({
  get: () => raw.value,
  set: (v: string) => {
    raw.value = v
  },
})

// Reparse the preview, debounced, whenever the markdown changes. The same parse
// path as the live routes guarantees fidelity.
let timer: ReturnType<typeof setTimeout> | null = null

// What the last parse found: the problems of the frontmatter, the components
// no registered component answers to, which the deck draws as plain content,
// the attributes the deck refuses or whose address the page does not load, or
// a failure after which the preview keeps the last good render.
const frontmatterIssues = ref<Array<LineProblem & { short: string }>>([])
const unknownMentions = ref<ComponentMention[]>([])
const refusedMentions = ref<AttributeMention[]>([])
const parseFailed = ref(false)
let parsedText = ''

const ATTRIBUTE_MESSAGES: Record<AttributeMention['reason'], { short: string, message: string }> = {
  url: { short: 'editor.diagnostics.refusedUrlShort', message: 'editor.diagnostics.refusedUrl' },
  binding: { short: 'editor.diagnostics.refusedBindingShort', message: 'editor.diagnostics.refusedBinding' },
  http: { short: 'editor.diagnostics.refusedEmbedShort', message: 'editor.diagnostics.refusedEmbed' },
}

// The frontmatter guide marks its own problems in the source pane; the list
// shows them with the others.
const previewIssues = computed(() => [
  ...frontmatterIssues.value.map(problem => ({ ...problem, marked: true })),
  ...unknownMentions.value.map(mention => ({
    ...mention,
    short: t('editor.diagnostics.unknownComponentShort', { line: mention.line, name: mention.name }),
    message: t('editor.diagnostics.unknownComponent', { name: mention.name }),
    marked: false,
  })),
  ...refusedMentions.value.map(mention => ({
    ...mention,
    short: t(ATTRIBUTE_MESSAGES[mention.reason].short, { line: mention.line, name: mention.name }),
    message: t(ATTRIBUTE_MESSAGES[mention.reason].message),
    marked: false,
  })),
].sort((a, b) => a.line - b.line || a.column - b.column))

async function reparse() {
  const text = raw.value
  try {
    const data = await buildPresentationData(text)
    preview.value = data
    unknownMentions.value = componentMentions(text, unknownDeckComponents(data))
    refusedMentions.value = attributeMentions(text)
    frontmatterIssues.value = listedFrontmatterProblems(text, t)
    parseFailed.value = false
    parsedText = text
    // Let Reveal register added/removed slides, then re-align to the caret so a
    // freshly-typed slide is reachable by the follow-cursor sync.
    await nextTick()
    previewRef.value?.sync?.()
    syncPreviewToCursor()
  }
  catch {
    parseFailed.value = true
  }
}

// The marks go to the text that was parsed; a text typed since then gets its
// own parse.
watch([previewIssues, editorView], ([issues, view]) => {
  if (!view || view.state.doc.toString() !== parsedText)
    return
  const problems = issues.filter(issue => !issue.marked).map(issue => ({ ...issue, severity: 'warning' as const }))
  view.dispatch({ effects: setPreviewProblems.of(placeProblems(view.state, problems)) })
})

function goToLine(line: number) {
  const view = editorView.value
  if (!view || line > view.state.doc.lines)
    return
  const at = view.state.doc.line(line).from
  view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) })
  view.focus()
}

const MENTIONS_SHOWN = 3
watch(raw, () => {
  if (timer)
    clearTimeout(timer)
  timer = setTimeout(reparse, 300)
}, { immediate: true })

// ── Real-time collaboration (Yjs + Hocuspocus) ──────────────────────────────
// Dynamically imported (client-only) so SSR/solo mode never loads the collab
// stack. The Y.Text is the live document; we mirror it into `raw` for the preview
// and let y-codemirror.next drive the editor + remote cursors.
let cleanupCollab: (() => void) | null = null

async function startCollab() {
  const [{ Doc }, { HocuspocusProvider }, { yCollab, yUndoManagerKeymap, yRemoteSelectionsTheme }] = await Promise.all([
    import('yjs'),
    import('@hocuspocus/provider'),
    import('y-codemirror.next'),
  ])

  const ydoc = new Doc()
  // Same-origin endpoint: the session cookie rides the upgrade request, so the
  // server authorizes there — no token to share.
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const provider = new HocuspocusProvider({
    // The deck rides the query so the upgrade can authorize it (per-deck grant)
    // before Hocuspocus reveals the document name.
    url: `${wsProtocol}://${window.location.host}/collab?deck=${encodeURIComponent(slug)}`,
    name: slug,
    document: ydoc,
  })

  provider.on('status', (e: { status: string }) => {
    collabStatus.value = e.status === 'connected' ? 'connected' : 'connecting'
  })
  provider.on('disconnect', () => {
    collabStatus.value = 'disconnected'
  })
  provider.on('synced', () => {
    docSynced.value = true
  })
  // Edits not yet acknowledged by the server: the header says so instead of
  // claiming they are saved.
  provider.on('unsyncedChanges', (e: { number: number }) => {
    synced.value = e.number === 0
  })
  // The publish endpoint broadcasts to the room; every client refreshes its
  // publication state instead of keeping the one it loaded.
  provider.on('stateless', ({ payload }: { payload: string }) => {
    try {
      if (JSON.parse(payload)?.type === 'published')
        void refreshPublished()
    }
    catch {}
  })

  const ytext = ydoc.getText('codemirror')
  // Mirror the live Y.Text into `raw` so the preview reparses on every change
  // (local or remote).
  const syncRaw = () => {
    raw.value = ytext.toString()
  }
  ytext.observe(syncRaw)

  // Remote carets show the account name, with a colour derived from the login
  // so it stays the same across reloads.
  const palette = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080']
  const login = user.value?.login
  const hue = [...(login ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  provider.awareness?.setLocalStateField('user', {
    name: user.value?.name || login || t('editor.page.anonymousPeer'),
    color: palette[hue % palette.length],
  })
  provider.awareness?.on('change', () => {
    const states = provider.awareness?.getStates()
    peerCount.value = states?.size ?? 0
    peers.value = states
      ? [...states.entries()]
          .filter(([id]) => id !== provider.awareness?.clientID)
          .map(([, state]) => state.user as { name: string, color: string })
          .filter(Boolean)
      : []
  })

  // yCollab wires sync + local awareness; yRemoteSelectionsTheme is
  // y-codemirror.next's own styling for remote carets/selections.
  collabExtensions.value = [
    yCollab(ytext, provider.awareness),
    yRemoteSelectionsTheme,
    keymap.of(yUndoManagerKeymap),
  ]

  cleanupCollab = () => {
    ytext.unobserve(syncRaw)
    provider.destroy()
    ydoc.destroy()
  }
}

// An unsaved solo draft deserves the browser's "leave the page?" guard.
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value)
    e.preventDefault()
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  if (collabEnabled.value)
    startCollab()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  cleanupCollab?.()
})

// ── Actions ─────────────────────────────────────────────────────────────────

async function save() {
  // Guard re-entry: these use $fetch directly, without a mutation's own in-flight
  // lock, so a double-click would fire two PUTs and race the save state.
  if (saveState.value === 'saving')
    return
  saveState.value = 'saving'
  try {
    const saved = raw.value
    const res = await $fetch<{ stamp?: number | null }>(`/api/presentations/${slug}`, {
      method: 'PUT',
      body: { raw: saved, stamp: draftStamp.value ?? null },
    })
    draftStamp.value = res.stamp ?? null
    lastSaved.value = saved
    loadedFrom.value = 'draft'
    saveState.value = 'idle'
    toast.add({ title: t('editor.save.saved'), icon: 'i-lucide-check', color: 'success' })
  }
  catch (e: any) {
    saveState.value = 'error'
    // A 409 means someone saved this draft after we loaded it.
    toast.add({
      title: e?.statusCode === 409 || e?.data?.data?.conflict || e?.data?.conflict
        ? t('editor.save.conflict')
        : requestErrorMessage(e, e?.message || t('editor.save.failed')),
      icon: 'i-lucide-triangle-alert',
      color: 'error',
    })
  }
}

const publishState = ref<'idle' | 'publishing' | 'error'>('idle')

async function publish() {
  if (publishState.value === 'publishing')
    return
  publishState.value = 'publishing'
  try {
    // Solo mode: make sure the draft carries the current text before deriving.
    if (!collabEnabled.value) {
      const res = await $fetch<{ stamp?: number | null }>(`/api/presentations/${slug}`, {
        method: 'PUT',
        body: { raw: raw.value, stamp: draftStamp.value ?? null },
      })
      draftStamp.value = res.stamp ?? null
      lastSaved.value = raw.value
    }
    await $fetch(`/api/presentations/${slug}/publish`, { method: 'POST' })
    publishedRaw.value = raw.value
    publishedAt.value = Date.now()
    publishState.value = 'idle'
    toast.add({ title: t('editor.publication.published'), description: t('editor.publication.publishedDescription'), icon: 'i-lucide-check', color: 'success' })
  }
  catch (e: any) {
    publishState.value = 'error'
    toast.add({ title: requestErrorMessage(e, e?.message || t('editor.publication.failed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
}

// ── Help panel ──────────────────────────────────────────────────────────────

const helpOpen = ref(false)
const activeParser = computed<'heading' | 'separator'>(() =>
  preview.value?.metadata?.parser === 'heading' ? 'heading' : 'separator')

function insertFromHelp(snippet: string) {
  helpOpen.value = false
  if (editorView.value)
    insertSnippet(editorView.value, snippet)
}

// ── History panel ───────────────────────────────────────────────────────────

const historyOpen = ref(false)

// A restored version reaches a collab room through Yjs; the solo editor
// re-reads the draft it replaced.
async function onRestored(stamp: number | null) {
  if (collabEnabled.value)
    return
  const fresh = await $fetch<{ content: string }>(`/api/presentations/${slug}`, { query: { draft: '' } })
  raw.value = fresh.content
  lastSaved.value = fresh.content
  draftStamp.value = stamp
}

// ── Markdown download ───────────────────────────────────────────────────────

// The draft is the text in the editor, saved or not; the published version is
// the one the page loaded.
const downloadItems = computed(() => [
  { label: t('editor.page.downloadDraft'), icon: 'i-lucide-file-pen-line', onSelect: () => saveTextFile(`${slug}.md`, raw.value, 'text/markdown') },
  { label: t('editor.page.downloadPublished'), icon: 'i-lucide-file-down', disabled: neverPublished.value, onSelect: () => saveTextFile(`${slug}.md`, publishedRaw.value ?? '', 'text/markdown') },
])

// ── Metadata panel (shared with the catalog) ────────────────────────────────

const metaOpen = ref(false)
const metaItem = ref<PresentationListItem | null>(null)

async function openMeta() {
  try {
    const list = await $fetch<PresentationListItem[]>('/api/presentations')
    metaItem.value = list.find(p => p.slug === slug) ?? null
    if (metaItem.value)
      metaOpen.value = true
  }
  catch {
    toast.add({ title: t('editor.page.metaLoadFailed'), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
}

async function onMetaSaved() {
  const fresh = await $fetch<{ status?: string, title?: string }>(
    `/api/presentations/${slug}`,
    { query: { draft: '' } },
  ).catch(() => null)
  if (fresh) {
    deckStatus.value = fresh.status ?? deckStatus.value
    deckTitle.value = fresh.title ?? deckTitle.value
  }
}
</script>

<template>
  <!-- A deck the reader may not open shows nothing of itself: not its slug,
       not its status, not the actions of an editor. -->
  <NuxtLayout
    v-if="loadError"
    name="default"
  >
    <ErrorState
      :icon="refusal.icon"
      :title="refusal.title"
      :description="refusal.description"
      :actions="refusal.actions"
      :back="{ to: '/' }"
    />
  </NuxtLayout>
  <div
    v-else
    class="tailwind-app h-screen flex flex-col overflow-hidden bg-muted"
  >
    <!-- The way back reads as on the catalog pages: the brand mark, then the
         path from the home page through the folder to this deck. The deck's
         own state and its publication sit on the right. -->
    <header
      class="flex items-center gap-2 sm:gap-3 px-3 h-14 shrink-0 border-b border-default bg-default"
    >
      <UTooltip :text="t('editor.page.backHome')">
        <NuxtLink
          to="/"
          :aria-label="t('editor.page.backHome')"
          class="grid place-items-center size-8 shrink-0 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <VignettesMark class="w-5" />
        </NuxtLink>
      </UTooltip>

      <!-- The title of the deck takes the width the other items leave. Below the
           `lg` width the breadcrumb shows its last item only. -->
      <UBreadcrumb
        :items="breadcrumb"
        class="min-w-0"
        :ui="{ list: 'min-w-0', item: 'min-w-0 not-last:shrink-0 max-lg:not-last:hidden', separator: 'max-lg:hidden', link: 'min-w-0', linkLabel: 'truncate' }"
      />

      <div class="flex-1" />

      <span
        v-if="!writable"
        class="text-xs text-muted"
      >{{ t('editor.page.readOnly') }}</span>

      <div
        v-if="collabEnabled"
        class="flex items-center -space-x-1"
      >
        <span
          v-for="peer in peers"
          :key="peer.name + peer.color"
          class="grid place-items-center size-6 rounded-full text-[10px] font-semibold text-white ring-2 ring-default"
          :style="{ backgroundColor: peer.color }"
          :title="t('editor.page.peerEditing', { name: peer.name })"
        >{{ initials(peer.name) }}</span>
      </div>

      <UTooltip :text="t('editor.page.historyTooltip')">
        <UButton
          :label="t('editor.page.history')"
          :aria-label="t('editor.page.history')"
          :ui="HEADER_BUTTON_UI"
          icon="i-lucide-history"
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0"
          @click="historyOpen = true"
        />
      </UTooltip>

      <UDropdownMenu
        :items="downloadItems"
        :content="{ align: 'end' }"
      >
        <UTooltip :text="t('editor.page.download')">
          <UButton
            icon="i-lucide-download"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            :aria-label="t('editor.page.download')"
          />
        </UTooltip>
      </UDropdownMenu>

      <!-- One entry to the deck's settings drawer, which names what it holds and
           shows the current visibility, beside the other states of the deck.
           Whoever may edit the deck may share it (canShare), so a collaborator
           opens the drawer on its sharing. -->
      <UTooltip
        v-if="statusDisplay"
        :text="privileged ? t('editor.page.settingsTooltip') : t('editor.page.settingsTooltipSharing')"
      >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          class="shrink-0 gap-2 max-sm:px-1.5"
          :aria-label="`${t('editor.page.settings')}, ${t(statusDisplay.labelKey)}`"
          :disabled="!privileged && !viewer.canEdit"
          @click="openMeta"
        >
          <UIcon
            name="i-lucide-settings-2"
            class="size-4"
          />
          <span :class="HEADER_LABEL">{{ t('editor.page.settings') }}</span>
          <span class="h-4 w-px bg-accented" />
          <span class="flex items-center gap-1 text-muted">
            <UIcon
              :name="statusDisplay.icon"
              class="size-3.5"
            />
            <span :class="HEADER_LABEL">{{ t(statusDisplay.labelKey) }}</span>
          </span>
        </UButton>
      </UTooltip>

      <!-- The draft state is an icon of fixed size; only a lost connection,
           which needs an action, adds text. -->
      <UTooltip
        v-if="collabEnabled"
        :text="`${syncIndicator.label}. ${t('editor.collab.hint')}`"
      >
        <span class="flex items-center gap-1.5 text-xs">
          <UIcon
            :name="syncIndicator.icon"
            class="size-4.5 shrink-0"
            :class="syncIndicator.class"
          />
          <template v-if="collabStatus === 'disconnected'">
            <span class="text-error">{{ t('editor.collab.offline') }}</span>
            <UButton
              :label="t('editor.collab.switchToSolo')"
              color="neutral"
              variant="link"
              size="xs"
              :to="`/edit/${slug}?solo`"
              external
            />
          </template>
        </span>
      </UTooltip>
      <template v-else-if="writable">
        <UTooltip :text="t('editor.collab.soloTooltip')">
          <UButton
            :label="t('editor.collab.solo')"
            :aria-label="t('editor.collab.solo')"
            :ui="HEADER_BUTTON_UI"
            icon="i-lucide-user"
            color="neutral"
            variant="link"
            size="xs"
            :to="`/edit/${slug}`"
            external
          />
        </UTooltip>
        <UChip
          :show="dirty"
          color="warning"
          size="lg"
        >
          <UButton
            :label="t('common.actions.save')"
            :aria-label="t('common.actions.save')"
            :ui="HEADER_BUTTON_UI"
            icon="i-lucide-save"
            color="neutral"
            variant="outline"
            :loading="saveState === 'saving'"
            :disabled="!dirty"
            @click="save"
          />
        </UChip>
      </template>

      <!-- The publication state lives on its button: a dot while the draft
           differs from what visitors see, « Publié » once they are the same. -->
      <UTooltip :text="`${publicationLabel}. ${publicationHint}`">
        <UChip
          :show="writable && unpublished === true"
          color="warning"
          size="lg"
        >
          <UButton
            :label="publishLabel"
            :aria-label="publishLabel"
            :ui="HEADER_BUTTON_UI"
            :icon="unpublished === false ? 'i-lucide-check' : 'i-lucide-send'"
            :color="unpublished === false ? 'neutral' : 'primary'"
            :variant="unpublished === false ? 'outline' : 'solid'"
            class="sm:w-28 justify-center"
            :loading="publishState === 'publishing'"
            :disabled="!writable || unpublished === false"
            @click="publish"
          />
        </UChip>
      </UTooltip>
    </header>

    <!-- The source pane takes a share of the width set by dragging its edge, kept
         in a cookie so the page renders at that share. Below the `md` width the
         slide sits above the source, across the whole width. -->
    <UDashboardGroup
      storage-key="editor"
      class="relative flex-1 min-h-0 max-md:flex-col"
    >
      <!-- The source pane carries its own bar: formatting and insertion act on
           the text below it, and the preview follows its caret. -->
      <UDashboardPanel
        id="source"
        resizable
        :default-size="50"
        :min-size="35"
        :max-size="75"
        role="region"
        :aria-label="t('editor.page.sourcePane')"
        :ui="{ root: 'min-h-0 max-md:flex-1 md:w-(--width) border-t md:border-t-0 md:border-e border-default bg-default overflow-hidden', handle: 'hidden md:block after:absolute after:inset-y-0 after:-left-px after:w-0.5 after:transition-colors hover:after:bg-primary active:after:bg-primary' }"
      >
        <EditorToolbar
          :view="editorView"
          :disabled="!writable"
          @upload-images="uploadChosenImages"
        >
          <template #end>
            <UTooltip :text="fragmentSteps ? t('editor.preview.fragmentStepsActive') : t('editor.preview.fragmentSteps')">
              <UButton
                icon="i-lucide-step-forward"
                color="neutral"
                :variant="fragmentSteps ? 'soft' : 'ghost'"
                size="sm"
                :class="fragmentSteps ? 'text-primary' : ''"
                :aria-pressed="fragmentSteps"
                :aria-label="t('editor.preview.fragmentSteps')"
                @click="toggleFragmentSteps"
              />
            </UTooltip>
            <UTooltip :text="followCursor ? t('editor.preview.followCursorActive') : t('editor.preview.followCursor')">
              <UButton
                icon="i-lucide-crosshair"
                color="neutral"
                :variant="followCursor ? 'soft' : 'ghost'"
                size="sm"
                :class="followCursor ? 'text-primary' : ''"
                :aria-pressed="followCursor"
                :aria-label="t('editor.preview.followCursor')"
                @click="toggleFollow"
              />
            </UTooltip>
          </template>
        </EditorToolbar>
        <ClientOnly>
          <!-- Collab mode: the Y.Text owns the document (no v-model — it would fight
               Yjs); the yCollab extension syncs the editor and we mirror into `raw`. -->
          <Codemirror
            v-if="collabEnabled"
            ref="cm"
            class="flex-1 min-h-0 overflow-hidden"
            :extensions="extensions"
            :tab-size="2"
          />
          <!-- Solo mode: plain two-way binding. -->
          <Codemirror
            v-else
            ref="cm"
            v-model="cmModel"
            class="flex-1 min-h-0 overflow-hidden"
            :extensions="extensions"
            :tab-size="2"
          />
          <template #fallback>
            <div class="flex-1 grid place-items-center text-muted text-sm">
              {{ t('editor.page.editorLoading') }}
            </div>
          </template>
        </ClientOnly>
        <EditorStatusBar
          v-model:wrap="wrapLines"
          :view="editorView"
          :slide="cursorSlideNumber"
          :slide-count="slideCount"
          @help="helpOpen = true"
        />
      </UDashboardPanel>

      <!-- The preview pane shows the slide at scale, with the commands of the
           deck page in the same bar and the same corner. -->
      <section
        class="editor-stage relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden"
        :style="{ '--ratio': previewRatio }"
        :aria-label="t('editor.preview.pane')"
      >
        <!-- The band above the slide: what the last parse found on the left,
             the commands of the deck page on the right. -->
        <div class="editor-stage__top">
          <ul
            v-if="parseFailed || previewIssues.length"
            class="editor-stage__issues"
            :aria-label="t('editor.diagnostics.list')"
          >
            <li v-if="parseFailed">
              <!-- The padding, text and icon of the `sm` buttons beside it. -->
              <UBadge
                :label="t('editor.diagnostics.parseFailed')"
                icon="i-lucide-circle-alert"
                color="neutral"
                variant="outline"
                class="max-w-full bg-default"
                :ui="{ base: 'px-2.5 py-1.5 text-xs gap-1.5', label: 'truncate', leadingIcon: 'size-4 text-error' }"
              />
            </li>
            <li
              v-for="issue in previewIssues.slice(0, MENTIONS_SHOWN)"
              :key="`${issue.line}-${issue.column}`"
              class="max-w-full"
            >
              <UTooltip :text="issue.message">
                <UButton
                  :label="issue.short"
                  icon="i-lucide-triangle-alert"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="max-w-full"
                  :ui="{ label: 'truncate', leadingIcon: 'text-warning' }"
                  @click="goToLine(issue.line)"
                />
              </UTooltip>
            </li>
            <li
              v-if="previewIssues.length > MENTIONS_SHOWN"
              class="px-1 text-xs text-muted"
            >
              {{ t('editor.diagnostics.more', previewIssues.length - MENTIONS_SHOWN) }}
            </li>
          </ul>

          <div
            class="editor-stage__controls"
            role="toolbar"
            :aria-label="t('editor.preview.controls')"
          >
            <DeckControlButton
              :label="neverPublished ? t('editor.preview.presentDraft') : t('editor.preview.present')"
              primary
              :to="`/slides/${slug}${neverPublished ? '?draft' : ''}${cursorSlideHash}`"
              target="_blank"
              rel="noopener"
            >
              <UIcon name="i-lucide-play" />
            </DeckControlButton>
            <DeckControlButton
              v-if="writable && !neverPublished"
              :label="t('editor.preview.draftPreview')"
              :to="`/slides/${slug}?draft${cursorSlideHash}`"
              target="_blank"
            >
              <UIcon name="i-lucide-eye" />
            </DeckControlButton>
          </div>
        </div>

        <div class="editor-stage__area">
          <div
            ref="previewFrame"
            class="editor-stage__frame"
            tabindex="0"
            role="group"
            :aria-label="t('editor.preview.frame')"
          >
            <!-- Client-only: the preview is driven by CodeMirror input + an async
               client-side reparse, so `preview` is always null on the server.
               SSR-ing it renders the placeholder, then hydration swaps to Reveal —
               a mismatch that crashes the minified prod build.
               The frame keeps the slide view at every width: Reveal lays a deck
               narrower than `scrollActivationWidth` (435px) out as its scroll
               view, a column of pages the frame cannot show. The status bar
               gives the slide number, so Reveal's arrows, number and progress
               bar stay off. Reveal reads the keyboard while the frame holds the
               focus, given by a click or by Tab (`keyboardCondition`), so a key
               typed elsewhere in the page stays there. -->
            <ClientOnly>
              <RevealPresentation
                v-if="preview?.slides?.length"
                ref="previewInstance"
                :key="preview.metadata.theme"
                :theme="preview.metadata.theme"
                :config="{ ...preview.metadata.reveal, fragments: previewFragments, scrollActivationWidth: null, controls: false, slideNumber: false, progress: false, embedded: true, keyboardCondition: previewHasFocus }"
                :lang="preview.metadata.lang"
                :code="preview.metadata.code"
                :controls="false"
                @ready="syncPreviewToCursor"
              >
                <RevealSlides :presentation-data="preview" />
              </RevealPresentation>
              <div
                v-else
                class="h-full grid place-items-center text-muted text-sm p-8 text-center"
              >
                {{ t('editor.preview.placeholder') }}
              </div>
              <template #fallback>
                <div class="h-full grid place-items-center text-muted text-sm p-8 text-center">
                  {{ t('editor.preview.placeholder') }}
                </div>
              </template>
            </ClientOnly>
          </div>
        </div>
      </section>
    </UDashboardGroup>

    <DeckMetaSlideover
      v-if="metaItem"
      v-model:open="metaOpen"
      :item="metaItem"
      :projects="projects"
      @saved="onMetaSaved"
    />

    <DeckHistorySlideover
      v-model:open="historyOpen"
      :slug="slug"
      :draft="raw"
      :unpublished="unpublished"
      @restored="onRestored"
    />

    <EditorHelpSlideover
      v-model:open="helpOpen"
      :parser="activeParser"
      :autosave="collabEnabled"
      @insert="insertFromHelp"
    />
  </div>
</template>

<style>
/* A remote caret pulses gently so a peer's activity reads at a glance. */
@keyframes y-caret-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.cm-ySelectionCaret {
  animation: y-caret-pulse 1.1s ease-in-out infinite;
}
</style>

<style scoped>
.editor-stage {
  container-type: inline-size;
  background: #e4e4e7;
}

.dark .editor-stage {
  background: #0e0e11;
}

/* The band above the slide grows with its rows; the slide takes the rest. */
.editor-stage__top {
  position: relative;
  z-index: 10;
  padding: 12px 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-stage__issues {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

/* The same bar as the deck page's commands, always open. */
.editor-stage__controls {
  flex: none;
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: rgba(22, 22, 26, 0.86);
  border-radius: 10px;
  /* The ring keeps the bar visible on the dark stage. */
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 6px 24px rgba(0, 0, 0, 0.25);
}

.editor-stage__controls > :deep(.deck-control:nth-last-child(-n + 3) .deck-control__tip) {
  right: 0;
  left: auto;
  transform: none;
}

/* A narrow stage keeps the bar to itself and puts the list below it. */
@container (max-width: 480px) {
  .editor-stage__top {
    flex-wrap: wrap;
  }

  .editor-stage__issues {
    flex-basis: 100%;
    order: 1;
  }
}

.editor-stage__area {
  position: relative;
  flex: 1;
  min-height: 0;
  container-type: size;
}

/* The slide at the largest size that fits below the band, in its proportions. */
.editor-stage__frame {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(calc(100cqw - 48px), calc((100cqh - 48px) * var(--ratio)));
  aspect-ratio: var(--ratio);
  overflow: hidden;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, -50%);
}

/* The preview's frames would take the pointer from a drag of the pane edge. */
[data-dragging='true'] ~ .editor-stage {
  pointer-events: none;
}

.editor-stage__frame:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.editor-stage__frame :deep(.reveal) {
  height: 100%;
}

/* Below the md width the panes stack: the stage comes first and is as tall as
   the slide at the full width, with the same margin. */
@media (width < 48rem) {
  .editor-stage {
    flex: none;
    order: -1;
  }

  .editor-stage__area {
    flex: none;
    height: calc((100cqw - 48px) / var(--ratio) + 48px);
  }
}
</style>
