<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { MediaPlacement, MediaSize } from '@vignettes/core/deck'
import type { Choice } from './ChoiceRow.vue'
import { DEFAULT_SIDE_MEDIA_SIZE, HEADING_MODES, layoutDefault, layoutForPlacement, layoutPlacement, layoutSize, MEDIA_FITS, MEDIA_PLACEMENTS, MEDIA_POSITIONS, MEDIA_SIZES, VERTICAL_ALIGNS } from '@vignettes/core/deck'
import { useCursorReading } from '../composables/useCursorReading'
import { placementSketch, slideLayoutAt, slideLayoutChange } from '../utils/editor-layout'
import { btnHover, menuWidth } from '../utils/toolbar-buttons'

// The layout of the slide under the cursor. Each choice rewrites its `:layout`
// line, so the preview, which follows the cursor, shows it at once.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const { t } = useI18n()

const { open, current, refresh } = useCursorReading(() => props.view, slideLayoutAt)

const attributes = computed(() => current.value?.attributes ?? {})
const value = (name: string) => (attributes.value[name] as string | undefined) ?? layoutDefault(name, attributes.value) ?? ''
const placement = computed(() => layoutPlacement(attributes.value) ?? 'none')
const side = computed(() => placement.value === 'right' || placement.value === 'left')
const size = computed(() => layoutSize(layoutPlacement(attributes.value), attributes.value.size as MediaSize | undefined) ?? '')

// Another author may have changed the line since the panel read it: each choice
// starts from the text as it is.
function write(next: (attributes: Record<string, unknown>) => Record<string, unknown>) {
  const view = props.view
  if (!view)
    return
  const at = slideLayoutAt(view.state)
  if (at.outside)
    return
  view.dispatch(slideLayoutChange(view.state, next(at.attributes)))
  refresh()
}

/** Sets an attribute; the value its absence gives, or none, removes it. */
function set(name: string, chosen: unknown) {
  write((fresh) => {
    const absent = name === 'size' ? layoutSize(layoutPlacement(fresh), undefined) : layoutDefault(name, fresh)
    const next = { ...fresh }
    if (chosen === undefined || chosen === '' || chosen === false || chosen === absent)
      delete next[name]
    else
      next[name] = chosen
    return next
  })
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

function row(name: string, values: readonly string[], label: (choice: string) => string, active = value(name), icons: Record<string, string> = {}): { name: string, choices: Choice[] } {
  return { name, choices: values.map(choice => ({ value: choice, label: label(choice), active: choice === active, icon: icons[choice] })) }
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
    ...(media && !behind ? [{ title: t('editor.layout.size'), icon: 'i-lucide-proportions', row: row('size', side.value ? MEDIA_SIZES : ['', ...MEDIA_SIZES], choice => choice || t('editor.layout.sizeAuto'), size.value) }] : []),
    ...(behind ? [{ title: t('editor.layout.veil'), icon: 'i-lucide-blend', row: row('veil', veils.value, choice => choice || t('editor.layout.veilNone'), (attributes.value.veil as string | undefined) ?? '') }] : []),
    ...(media ? [{ title: t('editor.layout.fit'), icon: 'i-lucide-crop', row: row('fit', MEDIA_FITS, choice => t(`editor.layout.fits.${choice}`), value('fit'), FIT_ICONS) }] : []),
    ...(media && value('fit') === 'cover' ? [{ title: t('editor.layout.position'), icon: 'i-lucide-scan-eye', iconOnly: true, row: row('position', MEDIA_POSITIONS, choice => t(`editor.layout.positions.${choice}`), value('position'), POSITION_ICONS) }] : []),
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
          <div
            v-if="current.legacy"
            class="flex items-center gap-2 rounded-md bg-elevated p-2 text-xs text-muted"
          >
            <span class="flex-1">{{ t('editor.layout.legacy') }}</span>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('editor.convert')"
              @click="write(fresh => fresh)"
            />
          </div>

          <section>
            <h3 class="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
              <UIcon
                name="i-lucide-image"
                class="size-3.5"
              />
              {{ t('editor.layout.placement') }}
            </h3>
            <div class="grid grid-cols-3 gap-1">
              <UButton
                v-for="at in PLACEMENTS"
                :key="at"
                color="neutral"
                :variant="placement === at ? 'soft' : 'ghost'"
                size="xs"
                class="flex-col gap-1"
                :class="placement === at ? 'text-highlighted' : btnHover"
                :aria-pressed="placement === at"
                @click="write(fresh => layoutForPlacement(fresh, at))"
              >
                <SlideSketch
                  :shapes="placementSketch(at, share)"
                  class="w-16 aspect-video"
                />
                <span>{{ t(`editor.layout.placements.${at}`) }}</span>
              </UButton>
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
              @choose="set(shown.row.name, $event)"
            />
          </section>

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
