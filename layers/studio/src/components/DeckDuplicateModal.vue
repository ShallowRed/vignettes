<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { slugify } from '@vignettes/core/slugify'
import { deckApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useDerivedSlug } from '../composables/useDerivedSlug'
import { useFormModal } from '../composables/useFormModal'
import { requestErrorMessage } from '../utils/request-error'

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

const { t } = useI18n()
const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

// The slug the server refused as taken.
const takenSlug = ref('')
const { state, errorMessage, runIfValid, onReset } = useFormModal(
  open,
  () => ({ title: props.item.title, slug: '', variantLabel: '', sourceVariantLabel: props.item.variantLabel ?? '' }),
)
onReset(() => {
  takenSlug.value = ''
})
const isVariant = computed(() => props.mode === 'variant')
// A variant's slug follows its title and its label, as `talk-en`.
const { slug, fill: fillSlug } = useDerivedSlug(
  state,
  () => isVariant.value ? `${state.title} ${state.variantLabel}` : state.title,
  value => slugify(value, { lower: true, strict: true }),
)
onReset(fillSlug)
// The source needs a label too, or the family card would show its slug.
const askSourceLabel = computed(() => isVariant.value && !props.item.variantLabel)

// The copy opens with the title of the source, so its slug may be the
// source's: the footer says so until the person changes a field.
const pristine = computed(() => state.title === props.item.title && !state.variantLabel && state.sourceVariantLabel === (props.item.variantLabel ?? ''))
const sourceSlug = computed(() => state.slug === props.item.slug)

const slugError = computed(() => {
  if (state.slug !== '' && !isDeckSlug(state.slug))
    return t('catalog.form.slugInvalid')
  if (sourceSlug.value && !pristine.value)
    return t('deck.duplicate.sourceAddress')
  return state.slug && state.slug === takenSlug.value ? t('catalog.form.addressTaken', { slug: state.slug }) : undefined
})

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
      title: isVariant.value ? t('deck.duplicate.variantCreated') : t('deck.duplicate.editionCreated'),
      description: state.title.trim(),
      icon: 'i-lucide-copy-plus',
      color: 'success',
    })
    await invalidatePresentations()
    await navigateTo(`/edit/${state.slug}`)
  },
  onError(e: any) {
    if (e?.statusCode === 409) {
      takenSlug.value = state.slug
      return
    }
    errorMessage.value = requestErrorMessage(e, t('deck.duplicate.failed'))
  },
})

// What the form still needs before it can be sent; the fields that hold an
// error show it.
const blockedReason = computed(() => {
  if (!state.title.trim())
    return t('catalog.form.missing.title')
  if (askSourceLabel.value && !state.sourceVariantLabel.trim())
    return t('deck.duplicate.missingSourceLabel')
  if (isVariant.value && !state.variantLabel.trim())
    return t('deck.duplicate.missingVariantLabel')
  if (!state.slug)
    return t('catalog.form.missing.address')
  if (sourceSlug.value)
    return t('deck.duplicate.sourceAddress')
  if (!isDeckSlug(state.slug) || slugError.value)
    return t('catalog.form.missing.addressInvalid')
  return undefined
})

function submit() {
  runIfValid(!blockedReason.value && !pending.value, runCopy)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isVariant ? t('deck.duplicate.variantTitle') : t('deck.duplicate.editionTitle')"
    :description="isVariant
      ? t('deck.duplicate.variantDescription', { title: item.title })
      : t('deck.duplicate.editionDescription', { title: item.title })"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          :label="t('common.fields.title')"
          required
        >
          <UInput
            v-model="state.title"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('common.fields.address')"
          :error="slugError"
          :help="t(isVariant ? 'deck.duplicate.variantAddressHelp' : 'catalog.form.deckAddressHelp', { slug: state.slug || '…' })"
          required
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="slug"
              :placeholder="t('common.fields.slugPlaceholder')"
              class="flex-1 font-mono"
            />
            <UButton
              icon="i-lucide-wand-sparkles"
              color="neutral"
              variant="subtle"
              :aria-label="t('common.actions.fillFromTitle')"
              :disabled="!state.title.trim()"
              @click="fillSlug"
            />
          </div>
        </UFormField>

        <div
          v-if="isVariant"
          class="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <UFormField
            v-if="askSourceLabel"
            :label="t('deck.duplicate.sourceLabel')"
            required
            :help="t('deck.duplicate.sourceLabelHelp')"
          >
            <UInput
              v-model="state.sourceVariantLabel"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('deck.duplicate.variantLabel')"
            required
            :help="t('deck.duplicate.variantLabelHelp')"
          >
            <UInput
              v-model="state.variantLabel"
              class="w-full"
            />
          </UFormField>
        </div>

        <p class="text-xs text-muted">
          {{ item.published === false ? t('deck.duplicate.copyNoteDraft') : t('deck.duplicate.copyNotePublished') }}
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
      <FormModalFooter
        :label="isVariant ? t('deck.duplicate.createVariant') : t('deck.duplicate.createEdition')"
        icon="i-lucide-copy-plus"
        :loading="pending"
        :blocked-reason="blockedReason"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </UModal>
</template>
