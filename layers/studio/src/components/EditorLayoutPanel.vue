<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { MediaPlacement } from '@vignettes/core/deck'
import { DEFAULT_SIDE_MEDIA_SIZE, HEADING_MODES, layoutDefault, layoutForPlacement, MEDIA_FITS, MEDIA_PLACEMENTS, MEDIA_POSITIONS, MEDIA_SIZES, VERTICAL_ALIGNS } from '@vignettes/core/deck'
import { EDITOR_TEXT, slideLayoutAt, slideLayoutChange } from '../utils/editor-layout'
import { btnActive, btnHover } from '../utils/toolbar-buttons'

// The layout of the slide under the cursor. Each choice rewrites its `:layout`
// line, so the preview, which follows the cursor, shows it at once.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const { t } = useI18n()

const open = ref(false)
const current = shallowRef(props.view ? slideLayoutAt(props.view.state) : undefined)

function read() {
  if (props.view)
    current.value = slideLayoutAt(props.view.state)
}

watch(open, (opened) => {
  if (opened)
    read()
})

// Another author may change the `:layout` line while the panel is open: the
// panel reads the slide again on each change of the text.
const text = inject(EDITOR_TEXT, undefined)
watch(() => text?.value, () => {
  if (open.value)
    read()
})

const attributes = computed(() => current.value?.attributes ?? {})
const value = (name: string) => (attributes.value[name] as string | undefined) ?? layoutDefault(name) ?? ''
// Without `media`, a source takes the default placement, and no source no media.
function placementOf(written: Record<string, unknown>): string {
  return (written.media as string | undefined) ?? (written.src || written.story ? layoutDefault('media')! : 'none')
}
const isSide = (at: string) => at === 'right' || at === 'left'

const placement = computed(() => placementOf(attributes.value))
const side = computed(() => isSide(placement.value))
const size = computed(() => (attributes.value.size as string | undefined) ?? (side.value ? DEFAULT_SIDE_MEDIA_SIZE : ''))

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
  read()
}

/** Sets an attribute; the value its absence gives, or none, removes it. */
function set(name: string, chosen: unknown) {
  write((fresh) => {
    const absent = name === 'size' && isSide(placementOf(fresh)) ? DEFAULT_SIDE_MEDIA_SIZE : layoutDefault(name)
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

/** The media and text zones of a placement thumbnail, in a 48 × 32 box. */
function zones(at: MediaPlacement | 'none') {
  const s = share.value
  const media = {
    none: undefined,
    right: { x: 46 - 44 * s, y: 2, width: 44 * s, height: 28 },
    left: { x: 2, y: 2, width: 44 * s, height: 28 },
    top: { x: 2, y: 2, width: 44, height: 16 },
    bottom: { x: 2, y: 14, width: 44, height: 16 },
    behind: { x: 0, y: 0, width: 48, height: 32 },
  }[at]
  const text = {
    none: { x: 5, y: 6, width: 30 },
    right: { x: 5, y: 8, width: 40 - 44 * s },
    left: { x: 44 * s + 6, y: 8, width: 40 - 44 * s },
    top: { x: 5, y: 22, width: 30 },
    bottom: { x: 5, y: 5, width: 30 },
    behind: { x: 6, y: 18, width: 14 },
  }[at]
  return { media, text }
}

interface Choice { label: string, value: string, active: boolean }

function row(name: string, values: readonly string[], label: (choice: string) => string, active = value(name)): { name: string, choices: Choice[] } {
  return { name, choices: values.map(choice => ({ value: choice, label: label(choice), active: choice === active })) }
}

const shownRows = computed(() => {
  const media = placement.value !== 'none'
  const behind = placement.value === 'behind'
  return [
    ...(media && !behind ? [{ title: t('editor.layout.size'), row: row('size', side.value ? MEDIA_SIZES : ['', ...MEDIA_SIZES], choice => choice || t('editor.layout.sizeAuto'), size.value) }] : []),
    ...(behind ? [{ title: t('editor.layout.veil'), row: row('veil', veils.value, choice => choice || t('editor.layout.veilNone'), (attributes.value.veil as string | undefined) ?? '') }] : []),
    ...(media ? [{ title: t('editor.layout.fit'), row: row('fit', MEDIA_FITS, choice => t(`editor.layout.fits.${choice}`)) }] : []),
    ...(media && value('fit') === 'cover' ? [{ title: t('editor.layout.position'), row: row('position', MEDIA_POSITIONS, choice => t(`editor.layout.positions.${choice}`)) }] : []),
    { title: t('editor.layout.align'), row: row('align', ['', ...VERTICAL_ALIGNS], choice => t(`editor.layout.aligns.${choice || 'auto'}`)) },
    { title: t('editor.layout.heading'), row: row('heading', ['', ...HEADING_MODES], choice => t(`editor.layout.headings.${choice || 'normal'}`)) },
  ]
})

const fields = computed(() => placement.value === 'none'
  ? []
  : [
      { name: 'src', label: t('editor.layout.src'), placeholder: '/images/…' },
      ...(placement.value === 'behind' ? [] : [{ name: 'story', label: t('editor.layout.story'), placeholder: 'composant--story' }]),
      { name: 'alt', label: t('editor.layout.alt'), placeholder: '' },
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
      :class="btnHover"
      :label="t('editor.layout.open')"
      :disabled="disabled || !view"
    />

    <template #content>
      <div
        v-if="current"
        class="w-88 max-w-[calc(100vw-1rem)] max-h-(--reka-popover-content-available-height) overflow-y-auto p-3 space-y-3 text-sm"
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
              :label="t('editor.layout.modernize')"
              @click="write(fresh => fresh)"
            />
          </div>

          <section>
            <h3 class="text-xs font-medium text-muted mb-1.5">
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
                <svg
                  viewBox="0 0 48 32"
                  class="w-12 h-8"
                  aria-hidden="true"
                >
                  <rect
                    x="0.5"
                    y="0.5"
                    width="47"
                    height="31"
                    rx="2"
                    class="fill-(--ui-bg) stroke-(--ui-border-accented)"
                  />
                  <rect
                    v-if="zones(at).media"
                    v-bind="zones(at).media"
                    rx="1.5"
                    class="fill-primary/30"
                  />
                  <rect
                    v-if="at === 'behind'"
                    :x="zones(at).text.x - 2"
                    :y="zones(at).text.y - 3"
                    :width="zones(at).text.width + 4"
                    height="11"
                    rx="1.5"
                    class="fill-(--ui-bg)"
                  />
                  <rect
                    v-for="line in 3"
                    :key="line"
                    :x="zones(at).text.x"
                    :y="zones(at).text.y + (line - 1) * 3"
                    :width="line === 1 ? zones(at).text.width * 0.7 : zones(at).text.width"
                    height="1.6"
                    rx="0.8"
                    class="fill-(--ui-text-muted)"
                  />
                </svg>
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
            <h3 class="text-xs font-medium text-muted mb-1.5">
              {{ shown.title }}
            </h3>
            <div class="flex gap-0.5 rounded-lg bg-elevated p-0.5">
              <UButton
                v-for="choice in shown.row.choices"
                :key="choice.value"
                color="neutral"
                variant="ghost"
                size="xs"
                class="flex-1 justify-center"
                :class="choice.active ? btnActive : btnHover"
                :aria-pressed="choice.active"
                :label="choice.label"
                @click="set(shown.row.name, choice.value)"
              />
            </div>
          </section>

          <UCheckbox
            v-if="placement !== 'none' && placement !== 'behind'"
            :model-value="Boolean(attributes.lightbox)"
            :label="t('editor.layout.lightbox')"
            size="sm"
            @update:model-value="set('lightbox', $event === true)"
          />
        </template>
      </div>
    </template>
  </UPopover>
</template>
