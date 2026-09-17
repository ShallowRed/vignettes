<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { slugify } from '@vignettes/core/slugify'
import { deckApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useFormModal } from '../composables/useFormModal'

/**
 * Copy a deck as a new draft, opened in the editor. A variant stands beside the
 * source in its family (a language, a format); an edition replaces it, the
 * source moving to the folder's replaced editions. The copy keeps the folder,
 * the theme and the access of the source.
 */
const props = defineProps<{
  item: PresentationListItem
  mode: 'variant' | 'edition'
}>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

const { state, errorMessage, runIfValid } = useFormModal(
  open,
  () => ({ title: props.item.title, slug: '', variantLabel: '', sourceVariantLabel: props.item.variantLabel ?? '' }),
)

const isVariant = computed(() => props.mode === 'variant')
// The source needs a label too, or the family card would show its slug.
const askSourceLabel = computed(() => isVariant.value && !props.item.variantLabel)

function slugFromTitle() {
  state.slug = slugify(state.title, { lower: true, strict: true })
}

const slugValid = computed(() => state.slug === '' || isDeckSlug(state.slug))

function close() {
  open.value = false
}

const { mutate: runCopy, isLoading: pending } = useMutation({
  mutation: () => deckApi.duplicate($fetch, props.item.slug, {
    slug: state.slug,
    mode: props.mode,
    title: state.title.trim(),
    ...(isVariant.value && state.variantLabel.trim() ? { variantLabel: state.variantLabel.trim() } : {}),
    ...(askSourceLabel.value && state.sourceVariantLabel.trim() ? { sourceVariantLabel: state.sourceVariantLabel.trim() } : {}),
  }),
  async onSuccess() {
    open.value = false
    toast.add({
      title: isVariant.value ? 'Variante créée' : 'Nouvelle édition créée',
      description: state.title.trim(),
      icon: 'i-lucide-copy-plus',
      color: 'success',
    })
    await invalidatePresentations()
    await navigateTo(`/edit/${state.slug}`)
  },
  onError(e: any) {
    errorMessage.value = e?.statusCode === 409
      ? `Le slug « ${state.slug} » est déjà pris.`
      : e?.statusMessage || 'Échec de la copie'
  },
})

const canSubmit = computed(() =>
  state.title.trim().length > 0
  && isDeckSlug(state.slug)
  && (!isVariant.value || state.variantLabel.trim().length > 0)
  && (!askSourceLabel.value || state.sourceVariantLabel.trim().length > 0)
  && !pending.value)

function submit() {
  runIfValid(canSubmit.value, runCopy)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isVariant ? 'Créer une variante' : 'Nouvelle édition'"
    :description="isVariant
      ? `Une copie de « ${item.title} » dans la même famille : les deux partagent une carte et se rejoignent depuis le lecteur.`
      : `Une copie de « ${item.title} » qui la remplace : l'ancienne passe dans les éditions remplacées du dossier.`"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Titre"
          required
        >
          <UInput
            v-model="state.title"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Slug"
          :error="slugValid ? undefined : 'Lettres, chiffres, tirets et underscores uniquement'"
          help="Identifiant de l'URL (/slides/…). La baguette le remplit depuis le titre."
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="state.slug"
              placeholder="mon-slug"
              class="flex-1 font-mono"
            />
            <UButton
              icon="i-lucide-wand-sparkles"
              color="neutral"
              variant="subtle"
              aria-label="Remplir depuis le titre"
              @click="slugFromTitle"
            />
          </div>
        </UFormField>

        <div
          v-if="isVariant"
          class="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <UFormField
            v-if="askSourceLabel"
            label="Libellé de l'original"
            required
            help="FR, Vidéo, Long…"
          >
            <UInput
              v-model="state.sourceVariantLabel"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Libellé de la variante"
            required
            help="EN, Atelier, Court…"
          >
            <UInput
              v-model="state.variantLabel"
              class="w-full"
            />
          </UFormField>
        </div>

        <p class="text-xs text-muted">
          La copie reprend le texte {{ item.published === false ? 'du brouillon' : 'publié' }}, le dossier, le thème et les accès. Elle s'ouvre dans l'éditeur comme brouillon, sans rien publier.
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="errorMessage"
        />
      </form>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Annuler"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          :label="isVariant ? 'Créer la variante' : 'Créer l\'édition'"
          icon="i-lucide-copy-plus"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
