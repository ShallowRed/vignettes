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
import type { PresentationData } from '~/types/presentation'
import { parserIdFor } from '#shared/deck'
import { STATUS_CONFIG } from '#shared/presentations'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import { useQuery } from '@pinia/colada'
import Codemirror from 'vue-codemirror6'
import { useAppSession } from '~/composables/useAppSession'
import { useEditorImageUpload } from '~/composables/useEditorImageUpload'
import { buildPresentationData } from '~/composables/usePresentation'
import { projectsQuery } from '~/queries'
import { insertSnippet, wrapSelection } from '~/utils/editor-commands'
import { deckCompletions } from '~/utils/editor-completions'
import { editorTheme } from '~/utils/editor-theme'
import { slideAtLine, slideRanges } from '~/utils/slide-map'

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
const deckStatus = ref<string>('private')
const loadedFrom = ref<'draft' | 'published' | 'file' | null>(null)
const preview = ref<PresentationData | null>(null)
const loadError = ref<string | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveMessage = ref('')

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
const unpublished = computed<boolean | null>(() => {
  if (collabEnabled.value && !docSynced.value)
    return null
  if (publishedRaw.value === null)
    return true
  return raw.value !== publishedRaw.value
})
const publishedAtLabel = computed(() =>
  publishedAt.value ? new Date(publishedAt.value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : null)
const publicationLabel = computed(() =>
  publishedRaw.value === null ? 'Jamais publié' : unpublished.value ? 'Modifications non publiées' : 'Publié à jour')
const publicationHint = computed(() => {
  const when = publishedAtLabel.value ? ` le ${publishedAtLabel.value}` : ''
  if (publishedRaw.value === null)
    return 'Les visiteurs ne voient encore rien : publiez le brouillon.'
  return unpublished.value
    ? `Les visiteurs voient la version publiée${when}. Publiez pour la mettre à jour.`
    : `Le brouillon est identique à la version publiée${when}.`
})
const collabLabel = computed(() => {
  if (collabStatus.value === 'disconnected')
    return 'Hors ligne'
  if (collabStatus.value !== 'connected' || !docSynced.value)
    return 'Connexion…'
  return synced.value ? 'Brouillon synchronisé' : 'Enregistrement…'
})
const collabDotClass = computed(() =>
  collabStatus.value === 'disconnected' ? 'bg-error' : collabStatus.value === 'connected' && docSynced.value && synced.value ? 'bg-success' : 'bg-warning')
const COLLAB_HINT = 'Brouillon partagé en temps réel : chaque modification est enregistrée automatiquement et visible par les autres éditeurs.'

function initials(name: string): string {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('')
}

if (error.value) {
  loadError.value = (error.value as any)?.statusMessage || 'Failed to load deck'
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

// ── CodeMirror setup ────────────────────────────────────────────────────────

const cm = useTemplateRef<{ view?: EditorView }>('cm')
const editorView = computed(() => cm.value?.view)

// ── Follow-the-cursor preview ────────────────────────────────────────────────
// The preview navigates to the slide the caret sits in. The slide parser drops
// source positions, so `slide-map` recomputes slide boundaries from the raw text
// (heuristic, editor-only) and we drive Reveal's slide(h, v) — "à peu près".
// Key must NOT be "preview": a `ref="preview"` would collide with the `preview`
// data ref above, and Vue would overwrite it with the component instance on
// mount — nuking `preview.value.slides`/`.metadata` and crashing every downstream
// computed. Hence the distinct "previewInstance" key.
const previewRef = useTemplateRef<{ slide: (h: number, v?: number) => void, sync: () => void }>('previewInstance')
const followCursor = ref(true)
const cursorLine = ref(1)
const parserId = computed(() => parserIdFor({ parser: preview.value?.metadata?.parser }))

function syncPreviewToCursor() {
  if (!followCursor.value || !previewRef.value)
    return
  const { h, v } = slideAtLine(slideRanges(raw.value, parserId.value), cursorLine.value)
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

function toggleFollow() {
  followCursor.value = !followCursor.value
}

const shortcutKeymap = keymap.of([
  {
    key: 'Mod-b',
    run: (view) => {
      wrapSelection(view, '**', 'texte')
      return true
    },
  },
  {
    key: 'Mod-i',
    run: (view) => {
      wrapSelection(view, '*', 'texte')
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
])

// Image upload (paste / drop): uploads to /api/media and inserts an ::Image
// directive at the caret/drop position.
const { imageUploadHandlers } = useEditorImageUpload(writable, slug)

// Appended by startCollab (yCollab + remote-caret styling + Yjs undo keymap).
const collabExtensions = shallowRef<Extension[]>([])

// Project slugs feed the frontmatter completion. Shares the catalog's `projects`
// query cache (same key) so navigating from the catalog needs no extra fetch.
const { data: projectsData } = useQuery(projectsQuery(requestFetch))
const projects = computed<Project[]>(() => projectsData.value ?? [])

const extensions = computed<Extension[]>(() => [
  markdown(),
  EditorView.lineWrapping,
  highlightActiveLine(),
  ...editorTheme(colorMode.value === 'dark' ? 'dark' : 'light'),
  deckCompletions({ projects: projects.value.map(p => p.slug) }),
  cursorListener,
  shortcutKeymap,
  imageUploadHandlers,
  // Yjs owns undo in collab mode; the local history would fight it.
  ...(collabEnabled.value ? collabExtensions.value : [history(), keymap.of(historyKeymap)]),
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
async function reparse() {
  try {
    preview.value = await buildPresentationData(raw.value)
    // Let Reveal register added/removed slides, then re-align to the caret so a
    // freshly-typed slide is reachable by the follow-cursor sync.
    await nextTick()
    previewRef.value?.sync?.()
    syncPreviewToCursor()
  }
  catch {
    // A transient half-typed state can fail to parse — keep the last good preview.
  }
}
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
  const login = user.value?.login ?? 'anonyme'
  const hue = [...login].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
  provider.awareness?.setLocalStateField('user', {
    name: user.value?.name || login,
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
    saveState.value = 'saved'
    saveMessage.value = 'Brouillon enregistré'
    setTimeout(() => {
      saveState.value = 'idle'
      saveMessage.value = ''
    }, 2500)
  }
  catch (e: any) {
    saveState.value = 'error'
    // A 409 means someone saved this draft after we loaded it.
    saveMessage.value = e?.statusCode === 409 || e?.data?.data?.conflict || e?.data?.conflict
      ? 'Quelqu\'un a enregistré ce brouillon entre-temps : rechargez la page pour repartir de sa version (vos modifications resteraient à reporter).'
      : e?.statusMessage || e?.message || 'Échec de l\'enregistrement'
  }
}

const publishState = ref<'idle' | 'publishing' | 'published' | 'error'>('idle')

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
    publishState.value = 'published'
    saveMessage.value = 'Publié'
    setTimeout(() => {
      publishState.value = 'idle'
      saveMessage.value = ''
    }, 2500)
  }
  catch (e: any) {
    publishState.value = 'error'
    saveMessage.value = e?.statusMessage || e?.message || 'Échec de la publication'
  }
}

// ── Help panel ──────────────────────────────────────────────────────────────

const helpOpen = ref(false)
const activeParser = computed<'heading' | 'separator'>(() =>
  preview.value?.metadata?.parser === 'separator' ? 'separator' : 'heading')

function insertFromHelp(snippet: string) {
  helpOpen.value = false
  if (editorView.value)
    insertSnippet(editorView.value, snippet)
}

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
    toast.add({ title: 'Impossible de charger les métadonnées', icon: 'i-lucide-triangle-alert', color: 'error' })
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
  <div class="tailwind-app h-screen flex flex-col overflow-hidden bg-default">
    <header class="flex items-center gap-2 px-3 h-14 shrink-0 border-b border-default">
      <!-- The app's brand mark doubles as the way back: the same anchor as the
           catalog header, so the editor reads as another room of the same app. -->
      <UTooltip text="Retour au catalogue">
        <NuxtLink
          to="/"
          aria-label="Retour au catalogue"
          class="grid place-items-center size-8 shrink-0 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <UIcon
            name="i-lucide-presentation"
            class="size-5"
          />
        </NuxtLink>
      </UTooltip>

      <div class="flex flex-col min-w-0">
        <span class="font-semibold text-highlighted text-sm truncate">
          {{ deckTitle || slug }}
        </span>
        <span class="text-xs text-dimmed font-mono truncate">{{ slug }}</span>
      </div>

      <!-- Editor state taxonomies stripped to plain text (clean base). -->
      <span
        v-if="statusDisplay"
        class="text-xs text-muted"
      >{{ statusDisplay.label }}</span>
      <template v-if="collabEnabled">
        <UTooltip :text="COLLAB_HINT">
          <span class="flex items-center gap-1.5 text-xs text-muted">
            <span
              class="size-1.5 rounded-full"
              :class="collabDotClass"
            />
            {{ collabLabel }}
          </span>
        </UTooltip>
        <div
          v-if="peers.length"
          class="flex items-center -space-x-1"
        >
          <span
            v-for="peer in peers"
            :key="peer.name + peer.color"
            class="grid place-items-center size-6 rounded-full text-[10px] font-semibold text-white ring-2 ring-default"
            :style="{ backgroundColor: peer.color }"
            :title="`${peer.name} édite en ce moment`"
          >{{ initials(peer.name) }}</span>
        </div>
        <UButton
          v-if="collabStatus === 'disconnected'"
          label="Passer en solo"
          color="neutral"
          variant="link"
          size="xs"
          :to="`/edit/${slug}?solo`"
          external
        />
      </template>
      <UTooltip
        v-else-if="writable"
        text="Mode solo : le brouillon s'enregistre à la demande, sans écraser une version plus récente"
      >
        <UButton
          label="Solo"
          icon="i-lucide-user"
          color="neutral"
          variant="link"
          size="xs"
          :to="`/edit/${slug}`"
          external
        />
      </UTooltip>

      <UTooltip
        v-if="writable && unpublished !== null"
        :text="publicationHint"
      >
        <span
          class="flex items-center gap-1.5 text-xs"
          :class="unpublished ? 'text-warning' : 'text-muted'"
        >
          <span
            class="size-1.5 rounded-full"
            :class="unpublished ? 'bg-warning' : 'bg-success'"
          />
          {{ publicationLabel }}
        </span>
      </UTooltip>

      <div class="flex-1" />

      <span
        v-if="!writable"
        class="text-xs text-muted"
      >Lecture seule</span>
      <span
        v-if="saveMessage"
        class="text-xs"
        :class="saveState === 'error' || publishState === 'error' ? 'text-error' : 'text-success'"
      >{{ saveMessage }}</span>
      <UTooltip
        v-else-if="dirty"
        text="Modifications non enregistrées"
      >
        <span class="flex items-center gap-1.5 text-xs text-warning">
          <span class="size-1.5 rounded-full bg-warning" />
          Non enregistré
        </span>
      </UTooltip>

      <UTooltip
        v-if="privileged"
        text="Métadonnées"
      >
        <UButton
          icon="i-lucide-settings-2"
          color="neutral"
          variant="ghost"
          aria-label="Métadonnées"
          @click="openMeta"
        />
      </UTooltip>

      <UTooltip
        v-if="writable"
        text="Aperçu du brouillon, tel qu'il sera publié"
      >
        <UButton
          icon="i-lucide-eye"
          color="neutral"
          variant="ghost"
          aria-label="Aperçu du brouillon"
          :to="`/slides/${slug}?draft`"
          target="_blank"
          external
        />
      </UTooltip>
      <UButton
        v-if="!collabEnabled"
        label="Enregistrer le brouillon"
        icon="i-lucide-save"
        color="neutral"
        variant="subtle"
        :loading="saveState === 'saving'"
        :disabled="!!loadError || !writable || !dirty"
        @click="save"
      />
      <UTooltip :text="unpublished === false ? 'Rien à publier : la version publiée est à jour' : 'Copie le brouillon vers la version que voient les visiteurs'">
        <UButton
          label="Publier"
          icon="i-lucide-send"
          :loading="publishState === 'publishing'"
          :disabled="!!loadError || !writable || unpublished === false"
          @click="publish"
        />
      </UTooltip>
      <UTooltip :text="followCursor ? 'Suivi de la diapo au curseur : activé' : 'Suivre la diapo au curseur'">
        <UButton
          icon="i-lucide-crosshair"
          color="neutral"
          :variant="followCursor ? 'subtle' : 'ghost'"
          aria-label="Suivre la diapo au curseur"
          @click="toggleFollow"
        />
      </UTooltip>
      <UTooltip text="Ouvrir la présentation">
        <UButton
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          :href="`/slides/${slug}`"
          target="_blank"
          rel="noopener"
          aria-label="Ouvrir la présentation"
        />
      </UTooltip>
    </header>

    <EditorToolbar
      v-if="!loadError"
      :view="editorView"
      :disabled="!writable"
      @help="helpOpen = true"
    />

    <div
      v-if="loadError"
      class="flex-1 grid place-items-center"
    >
      <UEmpty
        icon="i-lucide-file-x"
        title="Deck introuvable"
        :description="loadError"
        :actions="[{ label: 'Retour au catalogue', icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'subtle', to: '/' }]"
      />
    </div>

    <div
      v-else
      class="grid grid-cols-2 flex-1 min-h-0"
    >
      <ClientOnly>
        <!-- Collab mode: the Y.Text owns the document (no v-model — it would fight
             Yjs); the yCollab extension syncs the editor and we mirror into `raw`. -->
        <Codemirror
          v-if="collabEnabled"
          ref="cm"
          class="h-full overflow-auto border-r border-default"
          :extensions="extensions"
          :indent-with-tab="true"
          :tab-size="2"
        />
        <!-- Solo mode: plain two-way binding. -->
        <Codemirror
          v-else
          ref="cm"
          v-model="cmModel"
          class="h-full overflow-auto border-r border-default"
          :extensions="extensions"
          :indent-with-tab="true"
          :tab-size="2"
        />
        <template #fallback>
          <div class="h-full grid place-items-center text-muted text-sm border-r border-default">
            Chargement de l'éditeur…
          </div>
        </template>
      </ClientOnly>

      <div class="relative h-full overflow-hidden bg-white">
        <!-- Client-only: the preview is driven by CodeMirror input + an async
             client-side reparse, so `preview` is always null on the server.
             SSR-ing it renders the placeholder, then hydration swaps to Reveal —
             a mismatch that crashes the minified prod build. -->
        <ClientOnly>
          <RevealPresentation
            v-if="preview?.slides?.length"
            ref="previewInstance"
            :key="preview.metadata.theme"
            :theme="preview.metadata.theme"
            :config="preview.metadata.reveal"
          >
            <RevealSlides :presentation-data="preview" />
          </RevealPresentation>
          <div
            v-else
            class="h-full grid place-items-center text-muted text-sm p-8 text-center"
          >
            La prévisualisation s'affichera ici.
          </div>
          <template #fallback>
            <div class="h-full grid place-items-center text-muted text-sm p-8 text-center">
              La prévisualisation s'affichera ici.
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>

    <DeckMetaSlideover
      v-if="metaItem"
      v-model:open="metaOpen"
      :item="metaItem"
      :projects="projects"
      @saved="onMetaSaved"
    />

    <EditorHelpSlideover
      v-model:open="helpOpen"
      :parser="activeParser"
      @insert="insertFromHelp"
    />
  </div>
</template>
