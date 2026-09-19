<script setup lang="ts">
import type { Project } from '#shared/projects'
import { PROJECT_ICONS, slugifyProject } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { projectApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useFormModal } from '../composables/useFormModal'
import { PROJECT_COLORS, projectSwatchStyle } from '../utils/project-colors'

const emit = defineEmits<{ created: [Project] }>()
// Create-project modal: a first-class catalog folder. The slug follows the
// title until edited by hand; the wand re-derives it on demand.
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const toast = useToast()
const { invalidateAll } = useCatalogCache()

const { state, errorMessage, runIfValid } = useFormModal(
  open,
  () => ({ title: '', slug: '', color: null as string | null, icon: null as string | null }),
)

const slugValid = computed(() => state.slug === '' || isDeckSlug(state.slug))

const { mutate: runCreate, isLoading: pending } = useMutation({
  mutation: () => projectApi.create($fetch, {
    title: state.title.trim(),
    ...(state.color ? { color: state.color } : {}),
    ...(state.icon ? { icon: state.icon } : {}),
    ...(state.slug ? { slug: state.slug } : {}),
  }),
  async onSuccess(project) {
    // Refetch the folders query so the new folder is present before we navigate.
    await invalidateAll()
    open.value = false
    toast.add({ title: t('catalog.projectCreate.created'), description: project.title, icon: 'i-lucide-folder-plus', color: 'success' })
    emit('created', project)
  },
  onError(e: any) {
    errorMessage.value = e?.statusCode === 409
      ? t('catalog.form.identifierTaken', { slug: state.slug })
      : e?.statusMessage || t('catalog.form.createFailed')
  },
})

const canSubmit = computed(() => state.title.trim().length > 0 && slugValid.value && !pending.value)

function close() {
  open.value = false
}

function submit() {
  runIfValid(canSubmit.value, runCreate)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('common.actions.newFolder')"
    :description="t('catalog.projectCreate.description')"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          :label="t('common.fields.name')"
          required
        >
          <UInput
            v-model="state.title"
            :placeholder="t('catalog.projectCreate.namePlaceholder')"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('common.fields.identifier')"
          :error="slugValid ? undefined : t('catalog.form.slugInvalid')"
          :help="t('catalog.projectCreate.identifierHelp')"
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="state.slug"
              :placeholder="t('common.fields.folderSlugPlaceholder')"
              class="flex-1 font-mono"
            />
            <UButton
              icon="i-lucide-wand-sparkles"
              color="neutral"
              variant="subtle"
              :aria-label="t('catalog.projectCreate.fillFromName')"
              @click="state.slug = slugifyProject(state.title)"
            />
          </div>
        </UFormField>

        <UFormField
          :label="t('common.fields.icon')"
        >
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-for="i in PROJECT_ICONS"
              :key="i"
              type="button"
              class="grid place-items-center size-8 rounded-lg ring-2 transition bg-elevated"
              :class="(state.icon ?? 'folder') === i ? 'ring-primary' : 'ring-transparent'"
              :aria-label="i"
              @click="state.icon = i === 'folder' ? null : i"
            >
              <UIcon
                :name="`i-lucide-${i}`"
                class="size-4"
              />
            </button>
          </div>
        </UFormField>

        <UFormField
          :label="t('common.fields.color')"
          :help="t('catalog.projectCreate.colorHelp')"
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition bg-muted"
              :class="[state.color === null ? 'ring-primary' : 'ring-transparent']"
              :aria-label="t('common.fields.noColor')"
              @click="state.color = null"
            />
            <button
              v-for="c in PROJECT_COLORS"
              :key="c"
              type="button"
              class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition"
              :class="state.color === c ? 'ring-primary' : 'ring-transparent'"
              :style="projectSwatchStyle(c)"
              :aria-label="c"
              @click="state.color = c"
            />
          </div>
        </UFormField>

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
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          :label="t('catalog.projectCreate.submit')"
          icon="i-lucide-folder-plus"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
