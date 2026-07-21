<script setup lang="ts">
import type { Project } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { projectApi } from '~/api'
import { useCatalogCache } from '~/composables/useCatalog'
import { PROJECT_COLORS, projectSwatchStyle } from '~/utils/project-colors'

const emit = defineEmits<{ created: [Project] }>()
// Create-project modal: a first-class catalog folder. The slug is derived
// server-side from the title. Emits `created` with the new project.
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()
const { invalidateAll } = useCatalogCache()

const state = reactive({ title: '', color: null as string | null })
const errorMessage = ref('')

watch(open, (now) => {
  if (now) {
    Object.assign(state, { title: '', color: null })
    errorMessage.value = ''
  }
})

const { mutate: runCreate, isLoading: pending } = useMutation({
  mutation: () => projectApi.create($fetch, { title: state.title.trim(), ...(state.color ? { color: state.color } : {}) }),
  async onSuccess(project) {
    // Refetch the folders query so the new folder is present before we navigate.
    await invalidateAll()
    open.value = false
    toast.add({ title: 'Dossier créé', description: project.title, icon: 'i-lucide-folder-plus', color: 'success' })
    emit('created', project)
  },
  onError(e: any) {
    errorMessage.value = e?.statusMessage || 'Échec de la création'
  },
})

const canSubmit = computed(() => state.title.trim().length > 0 && !pending.value)

function close() {
  open.value = false
}

function submit() {
  if (!canSubmit.value)
    return
  errorMessage.value = ''
  runCreate()
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
          label="Couleur"
          help="Optionnel — teinte l'icône du dossier."
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
