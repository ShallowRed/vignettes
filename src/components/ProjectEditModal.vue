<script setup lang="ts">
import type { Project } from '#shared/projects'
import { isDeckSlug } from '#shared/deck'
import { PROJECT_COLORS, projectSwatchStyle } from '~/utils/project-colors'

// Edit a project's metadata (name, color, slug). Changing the slug cascades to
// the folder's decks and grants; old /projects/<slug> links stop resolving.
const props = defineProps<{ project: { slug: string, title: string, color?: string | null } }>()
const emit = defineEmits<{ saved: [Project] }>()
const open = defineModel<boolean>('open', { required: true })
const toast = useToast()

const state = reactive({ title: '', slug: '', color: null as string | null })
const pending = ref(false)
const errorMessage = ref('')

watch(open, (now) => {
  if (now) {
    state.title = props.project.title
    state.slug = props.project.slug
    state.color = props.project.color ?? null
    errorMessage.value = ''
  }
}, { immediate: true })

const slugValid = computed(() => isDeckSlug(state.slug))
const slugChanged = computed(() => state.slug !== props.project.slug)
const canSubmit = computed(() => state.title.trim().length > 0 && slugValid.value && !pending.value)

async function submit() {
  if (!canSubmit.value)
    return
  pending.value = true
  errorMessage.value = ''
  try {
    const project = await $fetch<Project>(`/api/admin/projects/${props.project.slug}`, {
      method: 'PATCH',
      body: { title: state.title.trim(), color: state.color, ...(slugChanged.value ? { slug: state.slug } : {}) },
    })
    open.value = false
    toast.add({ title: 'Dossier mis à jour', description: project.title, icon: 'i-lucide-check', color: 'success' })
    emit('saved', project)
  }
  catch (e: any) {
    errorMessage.value = e?.statusCode === 409
      ? `L'identifiant « ${state.slug} » est déjà pris.`
      : e?.statusMessage || 'Échec de la mise à jour'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Modifier le dossier"
    description="Nom, couleur et identifiant."
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
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Identifiant"
          :error="slugValid ? undefined : 'Lettres, chiffres, tirets et underscores uniquement'"
          help="Segment d'URL (/projects/…). Le changer casse les anciens liens du dossier."
        >
          <UInput
            v-model="state.slug"
            class="w-full font-mono"
            placeholder="mon-dossier"
          />
        </UFormField>

        <UFormField label="Couleur">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition bg-muted"
              :class="state.color === null ? 'ring-primary' : 'ring-transparent'"
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
          @click="open = false"
        />
        <UButton
          label="Enregistrer"
          icon="i-lucide-check"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
