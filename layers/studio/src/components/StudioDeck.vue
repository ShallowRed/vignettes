<script setup lang="ts">
import type { PresentationData } from '@vignettes/nuxt/types'
import type { RevealApi } from 'reveal.js'
import { deckPath } from '#shared/presentations'
import { inSpeakerViewFrame } from '@vignettes/core/render'

// A deck as the studio shows it: the Reveal presentation with the other
// variants of its family the visitor may open, the commands of whoever may edit
// it (editing the current slide, the draft, the folder) and the draft banner.
const props = defineProps<{
  slug?: string
  presentationData: PresentationData
  /** The working draft, previewed the way it will be published. */
  draft?: boolean
}>()

const { t } = useI18n()
// The speaker view shows the deck in frames and sends its keys to them, so these
// frames get neither the draft banner nor the E key of the editor.
const speakerViewFrame = inSpeakerViewFrame(useRequestURL().search)
const draftBanner = computed(() => props.draft && !speakerViewFrame)

useHead({ title: () => `${props.presentationData.metadata.title || props.slug || ''} · Vignettes` })

// The deck renders without this answer, so it loads after the page.
interface Variant { slug: string, alias: string | null, title: string, variantLabel: string }
const { data: viewer } = useFetch<{ canEdit: boolean, variants?: Variant[], published?: boolean, unpublishedChanges?: boolean, project?: string | null }>(() => `/api/presentations/${props.slug}/viewer`, {
  server: false,
  lazy: true,
  immediate: Boolean(props.slug),
  default: () => ({ canEdit: false, variants: [] }),
})
// The family shows only when there is somewhere else to go.
const variants = computed(() => (viewer.value.variants?.length ?? 0) > 1 ? viewer.value.variants! : [])
const variantHref = (variant: Variant) => `${deckPath({ slug: variant.slug, alias: variant.alias ?? undefined })}${props.draft ? '?draft' : ''}`

const reveal = shallowRef<RevealApi | null>(null)
const indices = ref({ h: 0, v: 0 })
// Reveal names its arrows in English.
const ARROW_LABELS = { left: 'previous', right: 'next', up: 'up', down: 'down' } as const
function onReady(instance: RevealApi) {
  reveal.value = instance
  for (const [direction, label] of Object.entries(ARROW_LABELS))
    instance.getRevealElement().querySelector(`.controls .navigate-${direction}`)?.setAttribute('aria-label', t(`auth.viewer.controls.${label}`))
  indices.value = instance.getIndices()
  instance.on('slidechanged', (event: { indexh: number, indexv: number }) => {
    indices.value = { h: event.indexh, v: event.indexv }
  })
}

const slideHash = computed(() => `#/${indices.value.h}/${indices.value.v}`)
const editHref = computed(() => `/edit/${props.slug}?slide=${indices.value.h}/${indices.value.v}`)
const draftHref = computed(() => `/slides/${props.slug}${props.draft ? '' : '?draft'}${slideHash.value}`)
const folderHref = computed(() => viewer.value.project ? `/projects/${viewer.value.project}` : '/')

watch([reveal, () => viewer.value.canEdit], ([instance, canEdit]) => {
  if (instance && canEdit && !speakerViewFrame)
    instance.addKeyBinding({ keyCode: 69, key: 'E', description: t('auth.viewer.editSlideShortcut') }, () => navigateTo(editHref.value))
})
</script>

<template>
  <div
    v-if="draftBanner"
    class="tailwind-app fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-3 bg-warning text-white text-sm py-1.5 px-4 print:hidden"
  >
    <UIcon
      name="i-lucide-eye"
      class="size-4"
    />
    {{ t('auth.viewer.draftBanner') }}
    <NuxtLink
      :to="`/edit/${slug}`"
      class="underline"
    >
      {{ t('auth.viewer.openEditor') }}
    </NuxtLink>
  </div>
  <RevealPresentation
    :class="{ 'has-draft-banner': draftBanner }"
    :theme="presentationData.metadata.theme"
    :config="presentationData.metadata.reveal"
    :lang="presentationData.metadata.lang"
    :code="presentationData.metadata.code"
    @ready="onReady"
  >
    <RevealSlides :presentation-data="presentationData" />
    <template
      v-if="viewer.canEdit || variants.length"
      #controls-before
    >
      <span
        v-if="variants.length"
        class="deck-variants"
        role="group"
        :aria-label="t('auth.viewer.variants')"
      >
        <template
          v-for="variant in variants"
          :key="variant.slug"
        >
          <span
            v-if="variant.slug === slug"
            class="deck-variants__current"
            aria-current="page"
          >{{ variant.variantLabel }}</span>
          <DeckControlButton
            v-else
            :label="variant.title"
            :to="variantHref(variant)"
          >
            <span class="deck-variants__label">{{ variant.variantLabel }}</span>
          </DeckControlButton>
        </template>
      </span>
      <DeckControlButton
        v-if="viewer.canEdit"
        :label="t('common.actions.edit')"
        shortcut="E"
        :to="editHref"
        primary
      >
        <UIcon name="i-lucide-pencil" />
      </DeckControlButton>
      <!-- A deck never published has no other version to open. -->
      <DeckControlButton
        v-if="viewer.canEdit && !(draft && viewer.published === false)"
        :label="draft ? t('auth.viewer.viewPublished') : t('auth.viewer.viewDraft')"
        :to="draftHref"
        :badge="!draft && viewer.unpublishedChanges"
      >
        <UIcon :name="draft ? 'i-lucide-eye' : 'i-lucide-file-pen-line'" />
      </DeckControlButton>
    </template>
    <template
      v-if="viewer.canEdit"
      #controls-after
    >
      <DeckControlButton
        :label="t('auth.viewer.backToFolder')"
        :to="folderHref"
      >
        <UIcon name="i-lucide-folder-open" />
      </DeckControlButton>
    </template>
  </RevealPresentation>
</template>

<style scoped>
/* The draft banner takes the top of the window, so the commands sit below it. */
.has-draft-banner :deep(.deck-controls) {
  top: 44px;
}
</style>

<style scoped>
.deck-variants {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 6px;
  padding-right: 8px;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

.deck-variants__current,
.deck-variants__label {
  font: 600 13px/1 system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.deck-variants__current {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  color: #16161a;
  background: #fff;
  border-radius: 7px;
}
</style>
