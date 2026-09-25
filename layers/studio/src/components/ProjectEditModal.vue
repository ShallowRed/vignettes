<script setup lang="ts">
import type { Project } from '#shared/projects'
import { PROJECT_ICONS, slugifyProject } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { projectApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useFormModal } from '../composables/useFormModal'
import { PROJECT_COLORS, projectSwatchStyle } from '../utils/project-colors'
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
  icon: props.project.icon ?? null,
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
      ? t('catalog.form.identifierTaken', { slug: state.slug })
      : requestErrorMessage(e, t('catalog.projectEdit.saveFailed'))
  },
})

const canSubmit = computed(() => state.title.trim().length > 0 && slugValid.value && !pending.value)

function submit() {
  runIfValid(canSubmit.value, runSave)
}

function close() {
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('catalog.projectEdit.title')"
    :description="t('catalog.projectEdit.description')"
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
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('common.fields.identifier')"
          :error="slugValid ? undefined : t('catalog.form.slugInvalid')"
          :help="t('catalog.projectEdit.identifierHelp')"
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="state.slug"
              class="flex-1 font-mono"
              :placeholder="t('common.fields.folderSlugPlaceholder')"
            />
            <UButton
              icon="i-lucide-wand-sparkles"
              color="neutral"
              variant="subtle"
              :aria-label="t('catalog.projectEdit.regenerateFromName')"
              @click="() => { state.slug = slugifyProject(state.title) }"
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

        <UFormField :label="t('common.fields.color')">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition bg-muted"
              :class="state.color === null ? 'ring-primary' : 'ring-transparent'"
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
          :label="t('common.actions.save')"
          icon="i-lucide-check"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
