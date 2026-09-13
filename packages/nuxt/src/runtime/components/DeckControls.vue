<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DeckControlButton from './DeckControlButton.vue'

// The commands of a deck, gathered in the top-right corner: a discreet button
// that opens on hover or focus. The host adds its own commands before and after
// the ones every deck has.
const props = defineProps<{
  getInstance: () => any
}>()

const emit = defineEmits<{ print: [] }>()

const open = ref(false)
const idle = ref(false)
const fullscreen = ref(false)
const copied = ref(false)

// The bar fades out after two seconds without the pointer or the keyboard, so it
// stays off the slide while someone presents.
const IDLE_MS = 2000
let idleTimer: ReturnType<typeof setTimeout> | undefined

function wake() {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => idle.value = true, IDLE_MS)
}

function syncFullscreen() {
  fullscreen.value = Boolean(document.fullscreenElement)
}

onMounted(() => {
  window.addEventListener('pointermove', wake, { passive: true })
  window.addEventListener('keydown', wake)
  document.addEventListener('fullscreenchange', syncFullscreen)
  wake()
})

onBeforeUnmount(() => {
  clearTimeout(idleTimer)
  window.removeEventListener('pointermove', wake)
  window.removeEventListener('keydown', wake)
  document.removeEventListener('fullscreenchange', syncFullscreen)
})

function onFocusOut(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
    open.value = false
}

function toggleOverview() {
  props.getInstance()?.toggleOverview()
}

function openSpeakerView() {
  props.getInstance()?.getPlugin('notes')?.open()
}

function toggleFullscreen() {
  if (document.fullscreenElement)
    document.exitFullscreen()
  else
    document.documentElement.requestFullscreen()
}

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href)
  copied.value = true
  setTimeout(() => copied.value = false, 1500)
}
</script>

<template>
  <div
    class="deck-controls"
    :class="{ 'is-open': open, 'is-idle': idle && !open }"
    role="toolbar"
    aria-label="Commandes de la présentation"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="onFocusOut"
  >
    <button
      v-if="!open"
      type="button"
      class="deck-controls__toggle"
      aria-label="Afficher les commandes"
      :aria-expanded="open"
      @click="open = true"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      ><g
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      ><circle
        cx="12"
        cy="12"
        r="1"
      /><circle
        cx="19"
        cy="12"
        r="1"
      /><circle
        cx="5"
        cy="12"
        r="1"
      /></g></svg>
    </button>
    <template v-else>
      <template v-if="$slots.before">
        <slot name="before" />
        <span class="deck-controls__separator" />
      </template>
      <DeckControlButton
        label="Vue d’ensemble"
        shortcut="O"
        @click="toggleOverview"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        ><g
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        ><rect
          width="7"
          height="7"
          x="3"
          y="3"
          rx="1"
        /><rect
          width="7"
          height="7"
          x="14"
          y="3"
          rx="1"
        /><rect
          width="7"
          height="7"
          x="14"
          y="14"
          rx="1"
        /><rect
          width="7"
          height="7"
          x="3"
          y="14"
          rx="1"
        /></g></svg>
      </DeckControlButton>
      <DeckControlButton
        label="Vue conférencier"
        shortcut="S"
        @click="openSpeakerView"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        ><path
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M2 3h20m-1 0v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3m4 18l5-5l5 5"
        /></svg>
      </DeckControlButton>
      <DeckControlButton
        :label="fullscreen ? 'Quitter le plein écran' : 'Plein écran'"
        shortcut="F"
        @click="toggleFullscreen"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        ><path
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          :d="fullscreen
            ? 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m8 0v-3a2 2 0 0 1 2-2h3'
            : 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3'"
        /></svg>
      </DeckControlButton>
      <span class="deck-controls__separator" />
      <DeckControlButton
        :label="copied ? 'Lien copié' : 'Copier le lien de cette diapositive'"
        @click="copyLink"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        ><path
          v-if="copied"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20 6L9 17l-5-5"
        /><g
          v-else
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        ><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></g></svg>
      </DeckControlButton>
      <DeckControlButton
        label="Imprimer ou exporter en PDF"
        @click="emit('print')"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
        ><g
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
        ><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect
          width="12"
          height="8"
          x="6"
          y="14"
          rx="1"
        /></g></svg>
      </DeckControlButton>
      <template v-if="$slots.after">
        <span class="deck-controls__separator" />
        <slot name="after" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.deck-controls {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: system-ui, sans-serif;
  border-radius: 10px;
  transition: opacity 200ms ease;
}

.deck-controls.is-open {
  padding: 4px;
  background: rgba(22, 22, 26, 0.86);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
}

.deck-controls.is-idle {
  opacity: 0;
}

.deck-controls__toggle {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.45);
  border: 0;
  border-radius: 6px;
  opacity: 0.35;
  transition: opacity 150ms ease;
}

.deck-controls__toggle:focus-visible {
  opacity: 1;
}

.deck-controls__toggle svg {
  width: 20px;
  height: 20px;
}

.deck-controls__separator {
  width: 1px;
  height: 22px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.18);
}

/* The last tooltip aligns on the bar's right edge so it stays in the window. */
.deck-controls > :deep(.deck-control:last-child .deck-control__tip) {
  right: 0;
  left: auto;
  transform: none;
}

@media print {
  .deck-controls {
    display: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .deck-controls,
  .deck-controls__toggle {
    transition: none;
  }
}
</style>
