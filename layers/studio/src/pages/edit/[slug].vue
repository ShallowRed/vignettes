<script setup lang="ts">
import type { DeckViewer, PresentationListItem } from '#shared/presentations'
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
import type { PreviewInstance } from '../../composables/useEditorPreview'
import type { Translate } from '../../config/editor-reference'
import type { Severity } from '../../utils/editor-problems'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import { useQuery, useQueryCache } from '@pinia/colada'
import { parserIdFor, slideRanges, splitFrontmatter } from '@vignettes/core/deck'
import Codemirror from 'vue-codemirror6'
import { deckApi } from '../../api'
import { useCollabDraft } from '../../composables/useCollabDraft'
import { useCompletionKeys } from '../../composables/useCompletionKeys'
import { useDeckLinks } from '../../composables/useDeckLinks'
import { useDeckPublication } from '../../composables/useDeckPublication'
import { useDocsAddress } from '../../composables/useDocsAddress'
import { useEditorImageUpload } from '../../composables/useEditorImageUpload'
import { useEditorPreview } from '../../composables/useEditorPreview'
import { useSnapshotCapture } from '../../composables/useSnapshotCapture'
import { presentationsQuery, projectsQuery } from '../../queries'
import { CODE_LANGUAGES } from '../../utils/editor-code-languages'
import { insertSnippet, wrapSelection } from '../../utils/editor-commands'
import { deckCompletions } from '../../utils/editor-completions'
import { deckHover } from '../../utils/editor-hover'
import { formatJson, jsonFormatNotice } from '../../utils/editor-json'
import { editorKeymap } from '../../utils/editor-keymap'
import { EDITOR_TEXT } from '../../utils/editor-layout'
import { previewProblemMarks } from '../../utils/editor-problems'
import { deckStructure } from '../../utils/editor-slides'
import { editorTheme } from '../../utils/editor-theme'
import { wrappedLines } from '../../utils/editor-wrap'

const { t, locale } = useI18n()
const completionKeys = useCompletionKeys()
// The messages of the source pane that name the shortcut of the suggestions read it from `keys`.
const tWithKeys = ((key: string, named?: number | Record<string, unknown>) =>
  typeof named === 'number' ? t(key, named) : t(key, { keys: completionKeys.value, ...named })) as Translate
const docsUrl = useDocsAddress()

definePageMeta({ layout: false })

const route = useRoute()
const slug = route.params.slug as string
// Real-time collaboration is the default: every writer of a deck edits the same
// CRDT document. `?solo` opts out: a plain CodeMirror editor with explicit,
// conflict-checked saves.
const soloRequested = computed(() => 'solo' in route.query)

const colorMode = useColorMode()
const toast = useToast()

const raw = ref('')
provide(EDITOR_TEXT, raw)
const deckTitle = ref<string | undefined>(undefined)
useHead({ title: () => t('editor.page.pageTitle', { title: deckTitle.value || slug }) })
const deckStatus = ref<string>('private')
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

// Load the working draft (falls back to the published version).
// useRequestFetch: the SSR pass must re-emit the session cookie — `?draft`
// requires edit rights, so an anonymous internal fetch would 401.
const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData(`edit-${slug}`, () => deckApi.loadDraft(requestFetch, slug))

const writable = computed(() => data.value?.writable !== false)
const collabEnabled = computed(() => writable.value && !soloRequested.value)

const collab = useCollabDraft(slug, raw, collabEnabled)
const publication = useDeckPublication({
  slug,
  raw,
  source: error.value ? null : data.value,
  writable,
  collab: collabEnabled,
  docSynced: collab.docSynced,
  requestFetch,
  onPublished: notifyPublished,
})
collab.onPublished(publication.refreshPublished)
const { status: collabStatus, peers, indicator: syncIndicator } = collab
const { dirty, unpublished, neverPublished, publicationHint, saveState, publishState } = publication

// ⌘S captures a snapshot of the shared draft. Until the connection is up, the
// server may hold an older text than the editor, so nothing is captured.
const { capture: sendSnapshot } = useSnapshotCapture(slug)
function captureSnapshot() {
  if (collabStatus.value !== 'connected') {
    toast.add({ title: t('editor.collab.offline'), description: t('deck.history.snapshotOffline'), icon: 'i-lucide-cloud-off', color: 'error' })
    return
  }
  sendSnapshot()
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
}

// The folder of the deck, for the path back in the header.
const { data: viewer } = useFetch<DeckViewer>(() => `/api/presentations/${slug}/viewer`, {
  server: false,
  lazy: true,
  default: () => ({ canEdit: false, variants: [] }),
})

// ── CodeMirror setup ────────────────────────────────────────────────────────

const cm = useTemplateRef<{ view?: EditorView }>('cm')
const editorView = computed(() => cm.value?.view)

// A published theme compiled with other theme packages than this studio's
// renders with another engine stylesheet; the frontmatter guide marks `theme:`.
const { data: themeVersionGaps } = useFetch<string[]>('/api/themes/version-gaps', { default: () => [] })

const previewFrame = useTemplateRef<HTMLElement>('previewFrame')
// The key must not be "preview": a `ref="preview"` would collide with the
// `preview` data below, and Vue would overwrite it with the component instance
// on mount.
const previewInstance = useTemplateRef<PreviewInstance>('previewInstance')
const {
  preview,
  parserId,
  previewHasFocus,
  previewRatio,
  previewPending,
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
} = useEditorPreview({
  previewFrame,
  previewInstance,
  raw,
  loadedText: data.value?.content ?? '',
  editorView,
  staleThemes: themeVersionGaps,
  docsUrl,
  t,
  tWithKeys,
  locale,
})

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
      if (collabEnabled.value)
        captureSnapshot()
      else
        publication.save()
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

// Project slugs feed the frontmatter completion. Shares the catalog's `projects`
// query cache (same key) so navigating from the catalog needs no extra fetch.
const { data: projectsData } = useQuery(projectsQuery(requestFetch))
const projects = computed<Project[]>(() => projectsData.value ?? [])

const breadcrumb = computed(() => {
  const project = projects.value.find(p => p.slug === viewer.value.project)
  return [
    { label: t('common.home'), to: '/' },
    ...(project ? [{ label: project.title, to: `/projects/${project.slug}` }] : []),
    { label: deckTitle.value || slug },
  ]
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
  deckCompletions({ projects: projects.value.map(p => p.slug), lang: locale.value, staleThemes: themeVersionGaps.value, docsUrl }, tWithKeys),
  deckHover({ lang: locale.value, t, docsUrl }),
  previewProblemMarks(t),
  cursorListener,
  shortcutKeymap,
  imageUploadHandlers,
  // Yjs owns undo in collab mode; the local history would fight it.
  ...(collabEnabled.value ? collab.extensions.value : [history(), keymap.of(historyKeymap)]),
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

const SEVERITY_ICONS: Record<Severity, { icon: string, color: string }> = {
  error: { icon: 'i-lucide-circle-alert', color: 'text-error' },
  warning: { icon: 'i-lucide-triangle-alert', color: 'text-warning' },
  info: { icon: 'i-lucide-info', color: 'text-dimmed' },
}
const MENTIONS_SHOWN = 3

function goToLine(line: number) {
  const view = editorView.value
  if (!view || line > view.state.doc.lines)
    return
  const at = view.state.doc.line(line).from
  view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) })
  view.focus()
}

// An unsaved solo draft deserves the browser's "leave the page?" guard.
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value)
    e.preventDefault()
}

onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

// The notice names who sees the version just published, and offers the next
// step: the link to send, or the sharing tab of a private deck.
const { copyLinks } = useDeckLinks()
async function notifyPublished() {
  const open = deckStatus.value === 'public' || deckStatus.value === 'semi-private'
  // Read before the click, which writes to the clipboard at once.
  const item = open ? await deckItem().catch(() => null) : null
  toast.add({
    title: t('editor.publication.published'),
    description: t(deckStatus.value === 'public'
      ? 'editor.publication.publishedDescription'
      : deckStatus.value === 'semi-private' ? 'editor.publication.publishedDescriptionPassword' : 'editor.publication.publishedDescriptionPrivate'),
    icon: 'i-lucide-check',
    color: 'success',
    actions: [item
      ? { label: t('catalog.table.copyLink'), icon: 'i-lucide-link', color: 'neutral', variant: 'outline', onClick: () => copyLinks([item]) }
      : { label: t('editor.publication.share'), icon: 'i-lucide-share-2', color: 'neutral', variant: 'outline', onClick: () => openMeta('sharing') }],
  })
}

// ── Side panels ─────────────────────────────────────────────────────────────

const helpOpen = ref(false)
const historyOpen = ref(false)

// The help stays open beside the text, for the next insertion.
function insertFromHelp(snippet: string) {
  if (editorView.value)
    insertSnippet(editorView.value, snippet)
}

// ── Metadata panel (shared with the catalog) ────────────────────────────────

const metaOpen = ref(false)
const metaItem = ref<PresentationListItem | null>(null)
const metaFocus = ref<'sharing' | undefined>()

// The catalog entry of the deck, with its alias and its accesses, read through
// the cache the catalog pages and the settings drawer share.
const queryCache = useQueryCache()
async function deckItem(): Promise<PresentationListItem | null> {
  const { data: list } = await queryCache.refresh(queryCache.ensure(presentationsQuery($fetch)))
  return list?.find(p => p.slug === slug) ?? null
}

async function openMeta(focus?: 'sharing') {
  metaFocus.value = focus
  try {
    metaItem.value = await deckItem()
    if (metaItem.value)
      metaOpen.value = true
  }
  catch {
    toast.add({ title: t('editor.page.metaLoadFailed'), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
}

async function onMetaSaved() {
  const fresh = await deckApi.loadDraft($fetch, slug).catch(() => null)
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
    <EditorHeader
      :breadcrumb="breadcrumb"
      :slug="slug"
      :writable="writable"
      :collab="collabEnabled"
      :collab-status="collabStatus"
      :peers="peers"
      :indicator="syncIndicator"
      :dirty="dirty"
      :saving="saveState === 'saving'"
      :can-edit="viewer.canEdit"
      @save="publication.save"
      @settings="openMeta()"
      @versions="historyOpen = true"
    />

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
          :parser="parserId"
          :disabled="!writable"
          :help-open="helpOpen"
          @upload-images="uploadChosenImages"
          @help="helpOpen = !helpOpen"
        />
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
          :in-json="cursorInJson"
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
              <UTooltip>
                <template #content>
                  <CodeText :text="issue.message" />
                </template>
                <UButton
                  :label="issue.short"
                  :icon="SEVERITY_ICONS[issue.severity].icon"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="max-w-full"
                  :ui="{ label: 'truncate', leadingIcon: SEVERITY_ICONS[issue.severity].color }"
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

          <!-- The same bar as the deck page's commands: the settings of the
               preview, then the deck opened in a new tab, the draft to preview
               it and the version the visitors see to present it. -->
          <div
            class="editor-stage__controls"
            role="toolbar"
            :aria-label="t('editor.preview.controls')"
          >
            <DeckControlButton
              v-if="slideSteps > 0"
              :label="t('editor.preview.fragmentSteps')"
              :tip="fragmentSteps ? t('editor.preview.fragmentStepsActive') : undefined"
              :pressed="fragmentSteps"
              @click="toggleFragmentSteps"
            >
              <UIcon name="i-lucide-step-forward" />
            </DeckControlButton>
            <DeckControlButton
              :label="t('editor.preview.followCursor')"
              :tip="followCursor ? t('editor.preview.followCursorActive') : undefined"
              :pressed="followCursor"
              @click="toggleFollow"
            >
              <UIcon name="i-lucide-crosshair" />
            </DeckControlButton>
            <span class="editor-stage__separator" />
            <DeckControlButton
              v-if="writable"
              labelled
              :label="t('editor.preview.preview')"
              :tip="t('editor.preview.previewTip')"
              :to="`/slides/${slug}?draft${cursorSlideHash}`"
              target="_blank"
            >
              <UIcon name="i-lucide-eye" />
            </DeckControlButton>
            <DeckControlButton
              labelled
              :label="t('editor.preview.present')"
              :tip="neverPublished ? t('editor.preview.presentNeverPublished') : unpublished ? t('editor.preview.presentVersionTip') : undefined"
              :disabled="neverPublished"
              :to="`/slides/${slug}${cursorSlideHash}`"
              target="_blank"
              rel="noopener"
            >
              <UIcon name="i-lucide-play" />
            </DeckControlButton>
            <!-- Publishing: the one filled command of the editor. A dot marks a
                 draft the visitors do not see yet; once they see it, the
                 command stays in place, disabled. -->
            <DeckControlButton
              v-if="writable"
              primary
              :label="t('editor.publication.publish')"
              :tip="publicationHint"
              :badge="unpublished === true"
              :disabled="unpublished === false || publishState === 'publishing'"
              @click="publication.publish"
            >
              <UIcon name="i-lucide-send" />
            </DeckControlButton>
          </div>
        </div>

        <div class="editor-stage__area">
          <div
            ref="previewFrame"
            class="editor-stage__frame"
            :aria-busy="previewPending"
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
                @ready="onPreviewReady"
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
            <UBadge
              v-if="previewFragments && slideSteps > 0"
              icon="i-lucide-step-forward"
              :label="`${stepShown}/${slideSteps}`"
              color="neutral"
              variant="solid"
              size="sm"
              class="absolute right-2 bottom-2 z-30 rounded-full tabular-nums pointer-events-none"
              role="status"
              :aria-label="t('editor.preview.step', { shown: stepShown, total: slideSteps })"
            />
            <UProgress
              v-if="previewPending"
              :model-value="null"
              size="2xs"
              class="absolute inset-x-0 top-0 z-30 pointer-events-none"
              :ui="{ base: 'rounded-none bg-transparent' }"
            />
          </div>
        </div>
      </section>
    </UDashboardGroup>

    <DeckMetaSlideover
      v-if="metaItem"
      v-model:open="metaOpen"
      :item="metaItem"
      :focus="metaFocus"
      :projects="projects"
      @saved="onMetaSaved"
    />

    <DeckHistorySlideover
      v-model:open="historyOpen"
      :slug="slug"
      :draft="raw"
      :unpublished="unpublished"
      @restored="publication.reloadDraft"
    />

    <EditorHelpSlideover
      v-model:open="helpOpen"
      :parser="parserId"
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

.editor-stage__separator {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: rgba(255, 255, 255, 0.18);
}

.editor-stage__controls > :deep(.deck-control:nth-last-child(-n + 2) .deck-control__tip) {
  right: 0;
  left: auto;
  transform: none;
}

/* The tooltips of the two toggles start at their left edge, so they stay inside the pane on a narrow screen. */
.editor-stage__controls > :deep(.deck-control:nth-child(-n + 2) .deck-control__tip) {
  right: auto;
  left: 0;
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

  /* The commands show their icon, and their tooltip names them. */
  .editor-stage__controls :deep(.deck-control--labelled) {
    padding: 0 8px;
  }

  .editor-stage__controls :deep(.deck-control--labelled .deck-control__label) {
    display: none;
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
