<script setup lang="ts">
/**
 * Integrated Markdown editor (audit §5.10 — #16, Lot 1: solo editor).
 *
 * Split view: a CodeMirror markdown pane (the deck's raw source) on the left, a
 * LIVE reveal preview on the right that reparses as you type through the SAME
 * pipeline the deck routes use (`buildPresentationData` → RevealPresentation) —
 * so the preview is exactly what the published deck renders, no second parser.
 *
 * Saving persists the markdown back through `PUT /api/presentations/:slug`
 * (the ContentWriter from Lot 0). Markdown stays the source of truth.
 *
 * No real-time collaboration yet — that is Lot 2 (Yjs + Hocuspocus).
 */
import type { PresentationData } from '~/types/presentation'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import Codemirror from 'vue-codemirror6'
import { buildPresentationData } from '~/composables/usePresentation'

definePageMeta({ layout: false })

const route = useRoute()
const slug = route.params.slug as string

const raw = ref('')
const access = ref<string>('public')
const preview = ref<PresentationData | null>(null)
const loadError = ref<string | null>(null)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveMessage = ref('')

// CodeMirror extensions: markdown language + soft line wrapping.
const extensions = [markdown(), EditorView.lineWrapping]

// Load the deck's current markdown (raw source + its access folder, for save-back).
const { data, error } = await useAsyncData(`edit-${slug}`, () =>
  $fetch<{ content: string, status?: string }>(`/api/presentations/${slug}`))

if (error.value) {
  loadError.value = (error.value as any)?.statusMessage || 'Failed to load deck'
}
else if (data.value) {
  raw.value = data.value.content
  if (data.value.status)
    access.value = data.value.status
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

async function save() {
  saveState.value = 'saving'
  try {
    const res = await $fetch<{ ok: boolean, key: string, bytes: number }>(
      `/api/presentations/${slug}`,
      { method: 'PUT', body: { access: access.value, raw: raw.value } },
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
      <span class="editor__title">Édition — {{ slug }} <em>({{ access }})</em></span>
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
        <Codemirror
          v-model="raw"
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
