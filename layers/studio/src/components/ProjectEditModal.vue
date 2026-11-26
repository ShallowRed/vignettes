<script setup lang="ts">
import type { Project } from '#shared/projects'
import { PROJECT_ICONS, slugifyProject } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { projectApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useFormModal } from '../composables/useFormModal'
import { requestErrorMessage } from '../utils/request-error'

// Edit a project's metadata (name, color, slug). Changing the slug cascades to
// the folder's decks and grants; old /projects/<slug> links stop resolving.
const props = defineProps<{ project: { slug: string, title: string, color?: string | null, icon?: string | null } }>()
const emit = defineEmits<{ saved: [Project] }>()
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const toast = useToast()
const { invalidateAll } = useCatalogCache()

const { state, errorMessage, runIfValid } = useFormModal(open, () => ({
  title: props.project.title,
  slug: props.project.slug,
  color: props.project.color ?? null,
  icon: PROJECT_ICONS.find(icon => icon === props.project.icon) ?? null,
}))

const slugValid = computed(() => isDeckSlug(state.slug))
const slugChanged = computed(() => state.slug !== props.project.slug)

const { mutate: runSave, isLoading: pending } = useMutation({
  mutation: () => projectApi.update($fetch, props.project.slug, {
    title: state.title.trim(),
    color: state.color,
    icon: state.icon,
    ...(slugChanged.value ? { slug: state.slug } : {}),
  }),
  async onSuccess(project) {
    // Title/color/slug all change the folders query; a slug change also cascades
    // to the decks' project, so refresh both catalog queries.
    await invalidateAll()
    open.value = false
    toast.add({ title: t('catalog.projectEdit.saved'), description: project.title, icon: 'i-lucide-check', color: 'success' })
    emit('saved', project)
  },
  onError(e: any) {
    errorMessage.value = e?.statusCode === 409
      ? t('catalog.form.addressTaken', { slug: state.slug })
      : requestErrorMessage(e, t('catalog.projectEdit.saveFailed'))
  },
})

const blockedReason = computed(() => {
  if (!state.title.trim())
    return t('catalog.form.missing.name')
  if (!state.slug)
    return t('catalog.form.missing.address')
  return slugValid.value ? undefined : t('catalog.form.missing.addressInvalid')
})

function submit() {
  runIfValid(!blockedReason.value && !pending.value, runSave)
}

function close() {
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('catalog.projectEdit.title')"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <ProjectFormFields
          v-model:title="state.title"
          v-model:slug="state.slug"
          v-model:icon="state.icon"
          v-model:color="state.color"
          :address-help="t('catalog.projectEdit.addressHelp', { slug: state.slug || '…' })"
          :regenerate-label="t('catalog.projectEdit.regenerateFromName')"
          :slug-valid="slugValid"
          @regenerate="state.slug = slugifyProject(state.title)"
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
        :label="t('common.actions.save')"
        icon="i-lucide-check"
        :loading="pending"
        :blocked-reason="blockedReason"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </UModal>
</template>
