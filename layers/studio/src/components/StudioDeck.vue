<script setup lang="ts">
import type { PresentationData } from '@vignettes/nuxt/types'

// A deck as the studio shows it: the Reveal presentation with the commands of
// whoever may edit it (editing the current slide, the draft, the folder), the
// draft banner, and the miniature mode of the catalog cards.
const props = defineProps<{
  slug?: string
  presentationData: PresentationData
  /** The working draft, previewed the way it will be published. */
  draft?: boolean
  /** The first slide alone, without commands, for a catalog card. */
  thumbnail?: boolean
}>()

const shownData = computed(() => props.thumbnail
  ? { ...props.presentationData, slides: props.presentationData.slides.slice(0, 1) }
  : props.presentationData)
const revealConfig = computed(() => props.thumbnail
  ? { ...props.presentationData.metadata.reveal, controls: false, progress: false, slideNumber: false, keyboard: false, hash: false, transition: 'none' as const }
  : props.presentationData.metadata.reveal)

// The deck renders without this answer, so it loads after the page.
const { data: viewer } = useFetch<{ canEdit: boolean, unpublishedChanges?: boolean, project?: string | null }>(() => `/api/presentations/${props.slug}/viewer`, {
  server: false,
  lazy: true,
  immediate: Boolean(props.slug) && !props.thumbnail,
  default: () => ({ canEdit: false }),
})

const reveal = shallowRef<any>(null)
const indices = ref({ h: 0, v: 0 })
function onReady(instance: any) {
  reveal.value = instance
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
  if (instance && canEdit)
    instance.addKeyBinding({ keyCode: 69, key: 'E', description: 'Éditer cette diapositive' }, () => navigateTo(editHref.value))
})
</script>

<template>
  <div
    v-if="draft && !thumbnail"
    class="tailwind-app fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-3 bg-warning text-white text-sm py-1.5 px-4"
  >
    <UIcon
      name="i-lucide-eye"
      class="size-4"
    />
    Aperçu du brouillon, non publié
    <NuxtLink
      :to="`/edit/${slug}`"
      class="underline"
    >
      Ouvrir l'éditeur
    </NuxtLink>
  </div>
  <RevealPresentation
    :class="{ 'has-draft-banner': draft && !thumbnail }"
    :theme="shownData.metadata.theme"
    :config="revealConfig"
    :lang="shownData.metadata.lang"
    :controls="!thumbnail"
    @ready="onReady"
  >
    <RevealSlides :presentation-data="shownData" />
    <template
      v-if="viewer.canEdit"
      #controls-before
    >
      <DeckControlButton
        label="Éditer"
        shortcut="E"
        :to="editHref"
        primary
      >
        <UIcon name="i-lucide-pencil" />
      </DeckControlButton>
      <DeckControlButton
        :label="draft ? 'Voir la version publiée' : 'Voir le brouillon'"
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
        label="Retour au dossier"
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
