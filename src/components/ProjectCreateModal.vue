<script setup lang="ts">
import type { Project } from '#shared/projects'
import { PROJECT_ICONS, slugifyProject } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { projectApi } from '~/api'
import { useCatalogCache } from '~/composables/useCatalog'
import { useFormModal } from '~/composables/useFormModal'
import { PROJECT_COLORS, projectSwatchStyle } from '~/utils/project-colors'

const emit = defineEmits<{ created: [Project] }>()
// Create-project modal: a first-class catalog folder. The slug follows the
// title until edited by hand; the wand re-derives it on demand.
const open = defineModel<boolean>('open', { required: true })
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
    toast.add({ title: 'Dossier créé', description: project.title, icon: 'i-lucide-folder-plus', color: 'success' })
    emit('created', project)
  },
  onError(e: any) {
    errorMessage.value = e?.statusCode === 409
      ? `L'identifiant « ${state.slug} » est déjà pris.`
      : e?.statusMessage || 'Échec de la création'
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
    title="Nouveau dossier"
    description="Un projet pour regrouper des présentations."
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Nom"
          required
        >
          <UInput
            v-model="state.title"
            placeholder="Nom du dossier"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Identifiant"
          :error="slugValid ? undefined : 'Lettres, chiffres, tirets et underscores uniquement'"
          help="Optionnel : laissé vide, il sera dérivé du nom. La baguette le remplit depuis le nom."
        >
          <div class="flex items-center gap-2">
            <UInput
              v-model="state.slug"
              placeholder="mon-dossier"
              class="flex-1 font-mono"
            />
            <UButton
              icon="i-lucide-wand-sparkles"
              color="neutral"
              variant="subtle"
              aria-label="Remplir depuis le nom"
              @click="state.slug = slugifyProject(state.title)"
            />
          </div>
        </UFormField>

        <UFormField
          label="Icône"
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
          label="Couleur"
          help="Optionnel : teinte l'icône du dossier."
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition bg-muted"
              :class="[state.color === null ? 'ring-primary' : 'ring-transparent']"
              aria-label="Sans couleur"
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
          label="Annuler"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          label="Créer le dossier"
          icon="i-lucide-folder-plus"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
