<script setup lang="ts">
import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { MediaPlacement, MediaSize, TextStep } from '@vignettes/core/deck'
import type { LayoutProposal, LayoutReading } from '../utils/editor-layout'
import type { Choice, ChoiceNote } from './ChoiceRow.vue'
import { DEFAULT_SIDE_MEDIA_SIZE, DEFAULT_TEXT_STEP, HEADING_MODES, layoutDefault, layoutPlacement, layoutSize, MEDIA_FITS, MEDIA_PLACEMENTS, MEDIA_POSITIONS, MEDIA_SIZES, TEXT_STEPS, VERTICAL_ALIGNS } from '@vignettes/core/deck'
import { useCursorReading } from '../composables/useCursorReading'
import { LAYOUT_PROBE } from '../composables/useLayoutProbe'
import { blockedPlacements, heldByFloor, layoutCandidates, placementSketch, slideLayoutAt, slideLayoutChange, slideLayoutProposal, slidePlacementChange } from '../utils/editor-layout'
import { OVERFLOW_THRESHOLD } from '../utils/preview-overflow'
import { btnHover, menuWidth } from '../utils/toolbar-buttons'

// The layout of the slide under the cursor. Each choice rewrites its `:layout`
// line, so the preview, which follows the cursor, shows it at once.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const { t, locale } = useI18n()

const { open, current, refresh } = useCursorReading(() => props.view, slideLayoutAt)

const attributes = computed(() => current.value?.attributes ?? {})
const value = (name: string) => (attributes.value[name] as string | undefined) ?? layoutDefault(name, attributes.value) ?? ''
const placement = computed(() => layoutPlacement(attributes.value) ?? 'none')
const side = computed(() => placement.value === 'right' || placement.value === 'left')
const size = computed(() => layoutSize(layoutPlacement(attributes.value), attributes.value.size as MediaSize | undefined) ?? '')

// Another author may have changed the line since the panel read it: each choice
// starts from the text as it is. It returns whether the change reached the text.
function write(change: (state: EditorState) => TransactionSpec): boolean {
  const view = props.view
  if (!view || view.state.readOnly || slideLayoutAt(view.state).outside)
    return false
  const spec = change(view.state)
  if (!spec.changes)
    return false
  view.dispatch(spec)
  refresh()
  return true
}

/** Writes the attributes of the slide's `:layout` that `next` gives from the written ones. */
function writeAttributes(next: (attributes: Record<string, unknown>) => Record<string, unknown>) {
  write(state => slideLayoutChange(state, next(slideLayoutAt(state).attributes)))
}

const { track } = useStudioEvent()

// The placements the media of the body cannot take, read with the slide. Their
// buttons stay focusable, so that their tooltip says why on hover and on focus.
const blocked = computed(() => current.value && props.view ? blockedPlacements(props.view.state) : {})

/** Places the media of the slide: a media of the body moves into `:layout`, a slide without one takes the placeholder image. */
function place(at: MediaPlacement | 'none') {
  if (write(state => slidePlacementChange(state, at)))
    track('layout-applied', { via: 'placement' })
}

/** Sets an attribute; the value its absence gives, or none, removes it. */
function set(name: string, chosen: unknown) {
  writeAttributes((fresh) => {
    const absent = name === 'size' ? layoutSize(layoutPlacement(fresh), undefined) : layoutDefault(name, fresh)
    const next = { ...fresh }
    if (chosen === undefined || chosen === '' || chosen === false || chosen === absent)
      delete next[name]
    else
      next[name] = chosen
    return next
  })
}

// Each size of the media and each step of the text, measured in a hidden render
// once the panel opens and again after a change of the text of the slide, as
// the preview waits for the typing to pause; then the path of the proposal.
// The panel keeps the place of what it measures from the opening on, so that
// the result moves nothing.
const probe = inject(LAYOUT_PROBE, undefined)
const readings = shallowRef<Record<string, LayoutReading>>({})
// The keys of the readings of the sizes and the steps the panel marks.
const sizeKeys = shallowRef<Partial<Record<MediaSize, string>>>({})
const stepKeys = shallowRef<Partial<Record<TextStep, string>>>({})
const proposal = shallowRef<LayoutProposal>()
const measured = ref(false)
// The slide has settings to measure, and a proposal to show.
const measurable = ref(false)
let measureTimer: ReturnType<typeof setTimeout> | undefined
let measuredText: string | undefined
let pendingText: string | undefined
onBeforeUnmount(() => clearTimeout(measureTimer))

/** The text of the slide under the cursor, which a measure reads. */
function slideText(): string | undefined {
  const view = props.view
  const at = current.value
  if (!view || !at || at.outside)
    return undefined
  return view.state.sliceDoc(view.state.doc.line(at.startLine).from, view.state.doc.line(Math.min(at.endLine, view.state.doc.lines)).to)
}

watch([open, current], ([opened]) => {
  if (!opened) {
    clearTimeout(measureTimer)
    measuredText = undefined
    pendingText = undefined
    return
  }
  const view = props.view
  const text = slideText()
  if (!view || text === measuredText || text === pendingText)
    return
  clearTimeout(measureTimer)
  // A measure of another text says nothing of this one.
  const { sizes, steps } = layoutCandidates(view.state)
  readings.value = {}
  sizeKeys.value = Object.fromEntries(Object.entries(sizes).map(([choice, found]) => [choice, found.key]))
  stepKeys.value = Object.fromEntries(Object.entries(steps).map(([choice, found]) => [choice, found.key]))
  proposal.value = undefined
  measured.value = false
  measurable.value = Object.keys(steps).length > 0 || Object.keys(sizes).length > 0
  pendingText = text
  measureTimer = setTimeout(async () => {
    const result = probe && measurable.value ? await probe.measure(view.state) : { readings: {} }
    // A later measure is under way.
    if (result === undefined || pendingText !== text)
      return
    pendingText = undefined
    // Nothing could be measured: the next change of the text measures again.
    if (result === null)
      return
    measuredText = text
    readings.value = result.readings
    proposal.value = result.proposal
    measured.value = true
  }, 300)
})

/** The changes a proposal makes to the written settings, in words. */
function proposedChanges(proposed: Record<string, unknown>): string {
  const written = attributes.value
  const changes: string[] = []
  if (!layoutPlacement(written) && layoutPlacement(proposed))
    changes.push(t('editor.layout.changes.media', { size: proposed.size }))
  else if (proposed.size !== written.size)
    changes.push(t('editor.layout.changes.size', { size: proposed.size }))
  if (proposed.heading !== written.heading)
    changes.push(t('editor.layout.changes.heading'))
  const step = (attributes: Record<string, unknown>) => attributes.text ?? DEFAULT_TEXT_STEP
  if (step(proposed) !== step(written))
    changes.push(t('editor.layout.changes.text', { step: step(proposed) }))
  if (proposed.inset !== written.inset)
    changes.push(t('editor.layout.changes.inset'))
  return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(changes)
}

const proposalText = computed(() => {
  const chosen = proposal.value
  if (!measured.value)
    return t('editor.layout.measuring')
  if (chosen?.kind === 'too-long')
    return t('editor.layout.tooLong')
  if (chosen?.grow)
    return t('editor.layout.proposeGrow', { step: chosen.attributes.text })
  if (chosen)
    return t('editor.layout.propose', { changes: proposedChanges(chosen.attributes) })
  return side.value ? t('editor.layout.sizeFits', { size: size.value }) : t('editor.layout.textFits')
})

// The panel notes a size that brings the body text below this share of its size.
const SHRUNK_TEXT = 0.99

/** What the panel says of a size it measured: the text overflows, or its body text shrinks. */
function sizeNote(choice: string): ChoiceNote | undefined {
  const key = sizeKeys.value[choice as MediaSize]
  const reading = key ? readings.value[key] : undefined
  if (!reading)
    return undefined
  if (reading.overflow > OVERFLOW_THRESHOLD)
    return { text: t('editor.layout.sizeOverflows'), severity: 'warning' }
  return reading.textScale < SHRUNK_TEXT ? { text: t('editor.layout.sizeShrinks', { percent: Math.round(reading.textScale * 100) }), severity: 'info' } : undefined
}

/** What the panel says of a step it measured: the text overflows, or the floor of the theme holds it at the size of the step above. */
function stepNote(choice: string): ChoiceNote | undefined {
  const step = TEXT_STEPS.indexOf(choice as TextStep)
  const reading = readings.value[stepKeys.value[choice as TextStep] ?? '']
  // A slide without a body, as a title alone, has no text the step sizes.
  if (!reading?.bodySize)
    return undefined
  if (reading.overflow > OVERFLOW_THRESHOLD)
    return { text: t('editor.layout.sizeOverflows'), severity: 'warning' }
  // Below the step of the theme, the floor may hold a step at the size of the one above it.
  const below = step < TEXT_STEPS.indexOf(DEFAULT_TEXT_STEP)
  const above = below ? readings.value[stepKeys.value[TEXT_STEPS[step + 1]!] ?? ''] : undefined
  return above && heldByFloor(reading, above) ? { text: t('editor.layout.stepHeld'), severity: 'info' } : undefined
}

// The proposal is written on the text as it is when the author applies it.
function applyProposal() {
  const chosen = proposal.value
  if (chosen?.kind === 'layout' && write(state => slideLayoutProposal(state, chosen.attributes)))
    track('layout-applied', { via: 'proposal' })
}

const PLACEMENTS: (MediaPlacement | 'none')[] = ['none', ...MEDIA_PLACEMENTS]
const VEILS = ['', '30%', '50%', '70%']
const veils = computed(() => {
  const written = attributes.value.veil as string | undefined
  return written && !VEILS.includes(written) ? [...VEILS, written] : VEILS
})

// The share of the media in a placement thumbnail follows the size chosen.
const share = computed(() => {
  const [p, q] = (size.value || DEFAULT_SIDE_MEDIA_SIZE).split('/').map(Number)
  return p! / q!
})

function row(name: string, values: readonly string[], label: (choice: string) => string, active = value(name), icons: Record<string, string> = {}, note?: (choice: string) => ChoiceNote | undefined): { name: string, choices: Choice[] } {
  return { name, choices: values.map(choice => ({ value: choice, label: label(choice), active: choice === active, icon: icons[choice], note: note?.(choice) })) }
}

const FIT_ICONS: Record<string, string> = { cover: 'i-lucide-expand', contain: 'i-lucide-shrink' }
const POSITION_ICONS: Record<string, string> = {
  center: 'i-lucide-circle-dot',
  top: 'i-lucide-arrow-up-to-line',
  bottom: 'i-lucide-arrow-down-to-line',
  left: 'i-lucide-arrow-left-to-line',
  right: 'i-lucide-arrow-right-to-line',
}
const ALIGN_ICONS: Record<string, string> = {
  top: 'i-lucide-align-vertical-justify-start',
  center: 'i-lucide-align-vertical-justify-center',
  bottom: 'i-lucide-align-vertical-justify-end',
}
const HEADING_ICONS: Record<string, string> = {
  '': 'i-lucide-heading',
  'compact': 'i-lucide-fold-vertical',
  'hidden': 'i-lucide-eye-off',
  'print': 'i-lucide-printer',
}

const shownRows = computed(() => {
  const media = placement.value !== 'none'
  const behind = placement.value === 'behind'
  return [
    ...(media && !behind ? [{ title: t('editor.layout.size'), icon: 'i-lucide-proportions', row: row('size', side.value ? MEDIA_SIZES : ['', ...MEDIA_SIZES], choice => choice || t('editor.layout.sizeAuto'), size.value, {}, sizeNote) }] : []),
    ...(behind ? [{ title: t('editor.layout.veil'), icon: 'i-lucide-blend', row: row('veil', veils.value, choice => choice || t('editor.layout.veilNone'), (attributes.value.veil as string | undefined) ?? '') }] : []),
    ...(media ? [{ title: t('editor.layout.fit'), icon: 'i-lucide-crop', row: row('fit', MEDIA_FITS, choice => t(`editor.layout.fits.${choice}`), value('fit'), FIT_ICONS) }] : []),
    ...(media && value('fit') === 'cover' ? [{ title: t('editor.layout.position'), icon: 'i-lucide-scan-eye', iconOnly: true, row: row('position', MEDIA_POSITIONS, choice => t(`editor.layout.positions.${choice}`), value('position'), POSITION_ICONS) }] : []),
    ...(current.value?.screen ? [] : [{ title: t('editor.layout.text'), icon: 'i-lucide-a-large-small', row: row('text', TEXT_STEPS, choice => choice, value('text'), {}, stepNote) }]),
    { title: t('editor.layout.align'), icon: 'i-lucide-move-vertical', row: row('align', ['', ...VERTICAL_ALIGNS], choice => t(`editor.layout.aligns.${choice || 'auto'}`), value('align'), ALIGN_ICONS) },
    { title: t('editor.layout.heading'), icon: 'i-lucide-heading', iconOnly: true, row: row('heading', ['', ...HEADING_MODES], choice => t(`editor.layout.headings.${choice || 'normal'}`), value('heading'), HEADING_ICONS) },
  ]
})

const fields = computed(() => placement.value === 'none'
  ? []
  : [
      { name: 'src', label: t('editor.layout.src'), icon: 'i-lucide-link', placeholder: '/images/…' },
      ...(placement.value === 'behind' ? [] : [{ name: 'story', label: t('editor.layout.story'), icon: 'i-lucide-book-open', placeholder: 'composant--story' }]),
      { name: 'alt', label: t('editor.layout.alt'), icon: 'i-lucide-captions', placeholder: '' },
    ])
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'start', collisionPadding: 8 }"
  >
    <UButton
      icon="i-lucide-layout-panel-left"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="t('editor.layout.open')"
      :ui="{ label: 'max-sm:sr-only' }"
      :disabled="disabled || !view"
    />

    <template #content>
      <div
        v-if="current"
        class="max-h-(--reka-popover-content-available-height) overflow-y-auto p-3 space-y-3 text-sm"
        :class="menuWidth"
      >
        <p
          v-if="current.outside"
          class="text-muted"
        >
          {{ t('editor.layout.outside') }}
        </p>
        <template v-else>
          <PanelNotice
            v-if="current.legacy"
            :text="t('editor.layout.legacy')"
            muted
          >
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('editor.convert')"
              @click="writeAttributes(fresh => fresh)"
            />
          </PanelNotice>

          <!-- Two lines from the opening on, the height of every result. -->
          <PanelNotice
            v-if="measurable"
            class="min-h-12"
            :text="proposalText"
            :muted="proposal?.kind !== 'layout'"
          >
            <UButton
              v-if="proposal?.kind === 'layout'"
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('editor.layout.apply')"
              @click="applyProposal"
            />
          </PanelNotice>

          <section>
            <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
              <UIcon
                name="i-lucide-image"
                class="size-3.5"
              />
              {{ t('editor.layout.placement') }}
            </h3>
            <div class="grid grid-cols-3 gap-1">
              <UTooltip
                v-for="at in PLACEMENTS"
                :key="at"
                :text="blocked[at as MediaPlacement] && t(`editor.layout.blocked.${blocked[at as MediaPlacement]}`)"
                :disabled="!blocked[at as MediaPlacement]"
              >
                <UButton
                  color="neutral"
                  :variant="placement === at ? 'soft' : 'ghost'"
                  size="xs"
                  class="flex-col gap-1"
                  :class="placement === at ? 'text-highlighted' : !blocked[at as MediaPlacement] && btnHover"
                  :aria-pressed="placement === at"
                  :aria-disabled="Boolean(blocked[at as MediaPlacement])"
                  @click="place(at)"
                >
                  <SlideSketch
                    :shapes="placementSketch(at, share)"
                    class="w-16 aspect-video"
                  />
                  <span>{{ t(`editor.layout.placements.${at}`) }}</span>
                </UButton>
              </UTooltip>
            </div>
          </section>

          <UFormField
            v-for="field in fields"
            :key="field.name"
            :label="field.label"
            size="sm"
          >
            <UInput
              :model-value="(attributes[field.name] as string) ?? ''"
              :icon="field.icon"
              class="w-full"
              :placeholder="field.placeholder"
              @update:model-value="set(field.name, $event)"
            />
          </UFormField>

          <p
            v-if="placement !== 'none' && !attributes.src && !attributes.story"
            class="text-xs text-warning"
          >
            {{ t('editor.layout.missingSource') }}
          </p>

          <section
            v-for="shown in shownRows"
            :key="shown.row.name"
          >
            <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
              <UIcon
                :name="shown.icon"
                class="size-3.5"
              />
              {{ shown.title }}
            </h3>
            <ChoiceRow
              :choices="shown.row.choices"
              :icon-only="shown.iconOnly"
              :marks="(shown.row.name === 'size' || shown.row.name === 'text') && measurable"
              @choose="set(shown.row.name, $event)"
            />
          </section>

          <USwitch
            v-if="!current.screen"
            :model-value="attributes.inset === 'tight'"
            :label="t('editor.layout.inset')"
            size="sm"
            @update:model-value="set('inset', $event ? 'tight' : undefined)"
          />

          <USwitch
            v-if="placement !== 'none' && placement !== 'behind'"
            :model-value="Boolean(attributes.lightbox)"
            :label="t('editor.layout.lightbox')"
            size="sm"
            @update:model-value="set('lightbox', $event)"
          />
        </template>
      </div>
    </template>
  </UPopover>
</template>
