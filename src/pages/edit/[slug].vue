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
import { STATUS_CONFIG } from '#shared/presentations'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import Codemirror from 'vue-codemirror6'
import { useAppSession } from '~/composables/useAppSession'
import { buildPresentationData } from '~/composables/usePresentation'
import { wrapSelection } from '~/utils/editor-commands'
import { editorTheme } from '~/utils/editor-theme'

definePageMeta({ layout: false })

const route = useRoute()
const slug = route.params.slug as string
// Real-time collaboration is opt-in via ?collab. Without it, the editor
// is the solo CodeMirror editor.
const collabEnabled = computed(() => 'collab' in route.query)

const { privileged } = useAppSession()
const colorMode = useColorMode()
const toast = useToast()

const raw = ref('')
const lastSaved = ref('')
const deckTitle = ref<string | undefined>(undefined)
const deckStatus = ref<string>('draft')
const loadedFrom = ref<'draft' | 'published' | 'file' | null>(null)
const preview = ref<PresentationData | null>(null)
const loadError = ref<string | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveMessage = ref('')

// Collaboration state.
const collabStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting')
const peerCount = ref(0)

// Load the working draft (falls back to published version, then file).
// useRequestFetch: the SSR pass must re-emit the session cookie — `?draft`
// requires edit rights, so an anonymous internal fetch would 401.
const requestFetch = useRequestFetch()
const { data, error } = await useAsyncData(`edit-${slug}`, () =>
  requestFetch<{ content: string, status?: string, title?: string, from?: 'draft' | 'published' | 'file', writable?: boolean }>(
    `/api/presentations/${slug}`,
    { query: { draft: '' } },
  ))

const writable = computed(() => data.value?.writable !== false)
// In solo mode the draft is only "unsaved" when it differs from what the server has.
const dirty = computed(() => !collabEnabled.value && raw.value !== lastSaved.value)

if (error.value) {
  loadError.value = (error.value as any)?.statusMessage || 'Failed to load deck'
}
else if (data.value) {
  deckStatus.value = data.value.status ?? 'draft'
  deckTitle.value = data.value.title
  loadedFrom.value = data.value.from ?? null
  // Solo mode seeds the editor from the fetched markdown. In collab mode the
  // Y.Text is the ONLY source — seeded server-side — so we must NOT also push
  // this content in, or yCollab would duplicate it (one deck → N).
  if (!collabEnabled.value) {
    raw.value = data.value.content
    lastSaved.value = data.value.content
  }
}

const statusDisplay = computed(() => STATUS_CONFIG[deckStatus.value as keyof typeof STATUS_CONFIG])

// ── CodeMirror setup ────────────────────────────────────────────────────────

const cm = useTemplateRef<{ view?: EditorView }>('cm')
const editorView = computed(() => cm.value?.view)

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

// Appended by startCollab (yCollab + remote-caret styling + Yjs undo keymap).
const collabExtensions = shallowRef<Extension[]>([])

const extensions = computed<Extension[]>(() => [
  markdown(),
  EditorView.lineWrapping,
  highlightActiveLine(),
  ...editorTheme(colorMode.value === 'dark' ? 'dark' : 'light'),
  shortcutKeymap,
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
    url: `${wsProtocol}://${window.location.host}/collab`,
    name: slug,
    document: ydoc,
  })

  provider.on('status', (e: { status: string }) => {
    collabStatus.value = e.status === 'connected' ? 'connected' : 'connecting'
  })
  provider.on('disconnect', () => {
    collabStatus.value = 'disconnected'
  })

  const ytext = ydoc.getText('codemirror')
  // Mirror the live Y.Text into `raw` so the preview reparses on every change
  // (local or remote).
  const syncRaw = () => {
    raw.value = ytext.toString()
  }
  ytext.observe(syncRaw)

  // Give this client an identity for remote-cursor display.
  const palette = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080']
  provider.awareness?.setLocalStateField('user', {
    name: `Éditeur ${Math.floor(Math.random() * 1000)}`,
    color: palette[Math.floor(Math.random() * palette.length)],
  })
  provider.awareness?.on('change', () => {
    peerCount.value = provider.awareness ? provider.awareness.getStates().size : 0
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
  saveState.value = 'saving'
  try {
    const saved = raw.value
    await $fetch(`/api/presentations/${slug}`, { method: 'PUT', body: { raw: saved } })
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
    saveMessage.value = e?.statusMessage || e?.message || 'Échec de l\'enregistrement'
  }
}

const publishState = ref<'idle' | 'publishing' | 'published' | 'error'>('idle')

async function publish() {
  publishState.value = 'publishing'
  try {
    // Solo mode: make sure the draft carries the current text before deriving.
    if (!collabEnabled.value) {
      await $fetch(`/api/presentations/${slug}`, { method: 'PUT', body: { raw: raw.value } })
      lastSaved.value = raw.value
    }
    await $fetch(`/api/presentations/${slug}/publish`, { method: 'POST' })
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

// ── Metadata panel (shared with the catalog) ────────────────────────────────

const metaOpen = ref(false)
const metaItem = ref<PresentationListItem | null>(null)
const metaProjects = ref<Project[]>([])

async function openMeta() {
  try {
    const [list, projects] = await Promise.all([
      $fetch<PresentationListItem[]>('/api/presentations'),
      $fetch<Project[]>('/api/projects'),
    ])
    metaItem.value = list.find(p => p.slug === slug) ?? null
    metaProjects.value = projects
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
  <div class="h-screen flex flex-col overflow-hidden bg-default">
    <header class="flex items-center gap-2 px-3 h-14 shrink-0 border-b border-default">
      <UTooltip text="Retour au catalogue">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          to="/"
          aria-label="Retour au catalogue"
        />
      </UTooltip>

      <div class="flex flex-col min-w-0">
        <span class="font-semibold text-highlighted text-sm truncate">
          {{ deckTitle || slug }}
        </span>
        <span class="text-xs text-dimmed font-mono truncate">{{ slug }}</span>
      </div>

      <UBadge
        v-if="statusDisplay"
        :color="statusDisplay.color"
        variant="subtle"
        size="sm"
        :icon="statusDisplay.icon"
        :label="statusDisplay.label"
      />
      <UTooltip
        v-if="loadedFrom && loadedFrom !== 'draft'"
        :text="loadedFrom === 'published'
          ? 'Aucun brouillon : contenu chargé depuis la dernière version publiée'
          : 'Aucun brouillon : contenu chargé depuis le fichier committé'"
      >
        <UBadge
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-file-input"
          :label="loadedFrom === 'published' ? 'Depuis le publié' : 'Depuis le fichier'"
        />
      </UTooltip>

      <UBadge
        v-if="collabEnabled"
        :color="collabStatus === 'connected' ? 'success' : collabStatus === 'connecting' ? 'warning' : 'error'"
        variant="subtle"
        size="sm"
        icon="i-lucide-users"
        :label="collabStatus === 'connected' ? `Collab (${peerCount})` : collabStatus"
      />

      <div class="flex-1" />

      <UBadge
        v-if="!writable"
        color="warning"
        variant="outline"
        size="sm"
        icon="i-lucide-lock"
        label="Lecture seule"
      />
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

      <UButton
        v-if="!collabEnabled"
        label="Enregistrer"
        icon="i-lucide-save"
        color="neutral"
        variant="subtle"
        :loading="saveState === 'saving'"
        :disabled="!!loadError || !writable || !dirty"
        @click="save"
      />
      <UButton
        label="Publier"
        icon="i-lucide-send"
        :loading="publishState === 'publishing'"
        :disabled="!!loadError || !writable"
        @click="publish"
      />
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
        <RevealPresentation
          v-if="preview && preview.slides.length > 0"
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
      </div>
    </div>

    <DeckMetaSlideover
      v-if="metaItem"
      v-model:open="metaOpen"
      :item="metaItem"
      :projects="metaProjects"
      @saved="onMetaSaved"
    />
  </div>
</template>
