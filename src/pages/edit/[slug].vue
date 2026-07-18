<script setup lang="ts">
/**
 * Integrated Markdown editor.
 *
 * Split view: a CodeMirror markdown pane (the deck's raw source) on the left, a
 * LIVE reveal preview on the right that reparses as you type through the SAME
 * pipeline the deck routes use (`buildPresentationData` → RevealPresentation) —
 * so the preview is exactly what the published deck renders, no second parser.
 *
 * Saving persists the markdown back through `PUT /api/presentations/:slug`
 * (through the ContentWriter port). Markdown stays the source of truth.
 *
 * No real-time collaboration yet — the collab mode adds Yjs + Hocuspocus.
 */
import type { Extension } from '@codemirror/state'
import type { PresentationData } from '~/types/presentation'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import Codemirror from 'vue-codemirror6'
import { buildPresentationData } from '~/composables/usePresentation'

definePageMeta({ layout: false })

const route = useRoute()
const slug = route.params.slug as string
// Real-time collaboration is opt-in via ?collab. Without it, the editor
// is the solo CodeMirror editor.
const collabEnabled = computed(() => 'collab' in route.query)

const raw = ref('')
const deckStatus = ref<string>('public')
const preview = ref<PresentationData | null>(null)
const loadError = ref<string | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveMessage = ref('')

// Collaboration state.
const collabStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting')
const peerCount = ref(0)

// Editor theme: a readable local caret (the default was near-invisible, black on
// the dark-ish default) and a light editor surface. Remote carets are styled by
// y-codemirror.next's own `yRemoteSelectionsTheme` (added in collab mode).
const editorTheme = EditorView.theme({
  '&': { fontSize: '0.9rem', backgroundColor: '#ffffff', color: '#1a1a1a' },
  '.cm-content': { caretColor: '#1a1a1a' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#1a1a1a', borderLeftWidth: '2px' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#1a1a1a' },
})

// Base CodeMirror extensions; the Yjs collab extension is appended at mount.
const extensions = ref<Extension[]>([markdown(), EditorView.lineWrapping, editorTheme])
// In collab mode the Y.Text owns the document, so we DON'T use v-model (it would
// fight Yjs). `cmModel` is only bound in solo mode.
const cmModel = computed({
  get: () => raw.value,
  set: (v: string) => {
    raw.value = v
  },
})

// Load the deck's current markdown (status is display-only; it lives in the frontmatter).
const { data, error } = await useAsyncData(`edit-${slug}`, () =>
  $fetch<{ content: string, status?: string }>(`/api/presentations/${slug}`))

if (error.value) {
  loadError.value = (error.value as any)?.statusMessage || 'Failed to load deck'
}
else if (data.value) {
  if (data.value.status)
    deckStatus.value = data.value.status
  // Solo mode seeds the editor from the fetched markdown. In collab mode the
  // Y.Text is the ONLY source — seeded server-side from the file — so we must NOT
  // also push this content in, or yCollab would insert it on top of the synced
  // doc and duplicate it (one deck → N).
  if (!collabEnabled.value)
    raw.value = data.value.content
}

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
  const [{ Doc }, { HocuspocusProvider }, { yCollab, yRemoteSelectionsTheme }] = await Promise.all([
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

  // Append the collaborative binding to CodeMirror: yCollab wires sync + local
  // awareness, and yRemoteSelectionsTheme is y-codemirror.next's own styling for
  // remote carets/selections (the canonical way to make peers' cursors visible).
  extensions.value = [
    markdown(),
    EditorView.lineWrapping,
    editorTheme,
    yCollab(ytext, provider.awareness),
    yRemoteSelectionsTheme,
  ]

  cleanupCollab = () => {
    ytext.unobserve(syncRaw)
    provider.destroy()
    ydoc.destroy()
  }
}

onMounted(() => {
  if (collabEnabled.value)
    startCollab()
})

onBeforeUnmount(() => {
  cleanupCollab?.()
})

async function save() {
  saveState.value = 'saving'
  try {
    const res = await $fetch<{ ok: boolean, key: string, bytes: number }>(
      `/api/presentations/${slug}`,
      { method: 'PUT', body: { raw: raw.value } },
    )
    saveState.value = 'saved'
    saveMessage.value = `Saved ${res.bytes} B → ${res.key}`
    setTimeout(() => {
      saveState.value = 'idle'
    }, 2500)
  }
  catch (e: any) {
    saveState.value = 'error'
    saveMessage.value = e?.statusMessage || e?.message || 'Save failed'
  }
}
</script>

<template>
  <div class="editor">
    <header class="editor__bar">
      <span class="editor__title">Édition — {{ slug }} <em>({{ deckStatus }})</em></span>
      <span
        v-if="collabEnabled"
        class="editor__collab"
        :class="`editor__collab--${collabStatus}`"
        :title="`Collaboration : ${collabStatus}`"
      >
        ● {{ collabStatus === 'connected' ? `Collab (${peerCount})` : collabStatus }}
      </span>
      <span class="editor__spacer" />
      <span
        v-if="saveMessage"
        class="editor__msg"
        :class="`editor__msg--${saveState}`"
      >{{ saveMessage }}</span>
      <button
        type="button"
        class="editor__save"
        :disabled="saveState === 'saving' || !!loadError"
        @click="save"
      >
        {{ saveState === 'saving' ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
      <a
        class="editor__open"
        :href="`/slides/${slug}`"
        target="_blank"
        rel="noopener"
      >Ouvrir ↗</a>
    </header>

    <div
      v-if="loadError"
      class="editor__error"
    >
      {{ loadError }}
    </div>

    <div
      v-else
      class="editor__panes"
    >
      <ClientOnly>
        <!-- Collab mode: the Y.Text owns the document (no v-model — it would fight
             Yjs); the yCollab extension syncs the editor and we mirror into `raw`. -->
        <Codemirror
          v-if="collabEnabled"
          class="editor__code"
          :extensions="extensions"
          :indent-with-tab="true"
          :tab-size="2"
        />
        <!-- Solo mode: plain two-way binding. -->
        <Codemirror
          v-else
          v-model="cmModel"
          class="editor__code"
          :extensions="extensions"
          :indent-with-tab="true"
          :tab-size="2"
        />
        <template #fallback>
          <div class="editor__code editor__code--loading">
            Chargement de l’éditeur…
          </div>
        </template>
      </ClientOnly>

      <div class="editor__preview">
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
          class="editor__preview-empty"
        >
          La prévisualisation s’affichera ici.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.editor__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.9rem;
  background: #1a1a1a;
  color: #fff;
  font-size: 0.9rem;
}

.editor__title em {
  opacity: 0.6;
  font-style: normal;
}

.editor__collab {
  font-size: 0.8rem;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.1);
}

.editor__collab--connected {
  color: #7ee787;
}

.editor__collab--connecting {
  color: #f0c674;
}

.editor__collab--disconnected {
  color: #ff7b72;
}

.editor__spacer {
  flex: 1;
}

.editor__msg--saved {
  color: #7ee787;
}

.editor__msg--error {
  color: #ff7b72;
}

.editor__save {
  padding: 0.35rem 0.9rem;
  font: inherit;
  color: #1a1a1a;
  cursor: pointer;
  background: #fff;
  border: none;
  border-radius: 0.35rem;
}

.editor__save:disabled {
  opacity: 0.5;
  cursor: default;
}

.editor__open {
  color: #fff;
  text-decoration: none;
  opacity: 0.7;
}

.editor__panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1;
  min-height: 0;
}

.editor__code {
  height: 100%;
  overflow: auto;
  font-size: 0.9rem;
  border-right: 1px solid #ddd;
}

.editor__code--loading {
  padding: 1rem;
  color: #666;
}

.editor__preview {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.editor__preview-empty,
.editor__error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  padding: 2rem;
  text-align: center;
}
</style>
