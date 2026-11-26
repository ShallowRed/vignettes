<script setup lang="ts">
import type { Project, ProjectIcon } from '#shared/projects'
import { slugifyProject } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { projectApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useDerivedSlug } from '../composables/useDerivedSlug'
import { useFormModal } from '../composables/useFormModal'
import { requestErrorMessage } from '../utils/request-error'

const emit = defineEmits<{ created: [Project] }>()
// Create-project modal: a first-class catalog folder. The slug follows the
// title until edited by hand (`useDerivedSlug`); left empty, the server derives it.
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const toast = useToast()
const { invalidateAll } = useCatalogCache()

const { state, errorMessage, runIfValid, onReset } = useFormModal(
  open,
  () => ({ title: '', slug: '', color: null as string | null, icon: null as ProjectIcon | null }),
)
const { slug, fill: fillSlug } = useDerivedSlug(state, () => state.title, slugifyProject)
onReset(fillSlug)

const slugValid = computed(() => state.slug === '' || isDeckSlug(state.slug))

const { track } = useStudioEvent()
const { mutate: runCreate, isLoading: pending } = useMutation({
  mutation: () => projectApi.create($fetch, {
    title: state.title.trim(),
    ...(state.color ? { color: state.color } : {}),
    ...(state.icon ? { icon: state.icon } : {}),
    ...(state.slug ? { slug: state.slug } : {}),
  }),
  async onSuccess(project) {
    track('project-created', {})
    // Refetch the folders query so the new folder is present before we navigate.
    await invalidateAll()
    open.value = false
    toast.add({ title: t('catalog.projectCreate.created'), description: project.title, icon: 'i-lucide-folder-plus', color: 'success' })
    emit('created', project)
  },
  onError(e: any) {
    errorMessage.value = e?.statusCode === 409
      ? t('catalog.form.addressTaken', { slug: state.slug })
      : requestErrorMessage(e, t('catalog.form.createFailed'))
  },
})

const blockedReason = computed(() => {
  if (!state.title.trim())
    return t('catalog.form.missing.name')
  return slugValid.value ? undefined : t('catalog.form.missing.addressInvalid')
})

function close() {
  open.value = false
}

function submit() {
  runIfValid(!blockedReason.value && !pending.value, runCreate)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('common.actions.newFolder')"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <ProjectFormFields
          v-model:title="state.title"
          v-model:slug="slug"
          v-model:icon="state.icon"
          v-model:color="state.color"
          :address-help="t('catalog.projectCreate.addressHelp', { slug: state.slug || '…' })"
          :regenerate-label="t('catalog.projectCreate.fillFromName')"
          :slug-valid="slugValid"
          :name-placeholder="t('catalog.projectCreate.namePlaceholder')"
          :color-help="t('catalog.projectCreate.colorHelp')"
          @regenerate="fillSlug"
        />

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
        :label="t('catalog.projectCreate.submit')"
        icon="i-lucide-folder-plus"
        :loading="pending"
        :blocked-reason="blockedReason"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </UModal>
</template>
