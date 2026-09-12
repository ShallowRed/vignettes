<script setup lang="ts">
import type { Project } from '#shared/projects'
import { useMutation } from '@pinia/colada'
import { isDeckSlug } from '@vignettes/core/deck'
import { slugify } from '@vignettes/core/slugify'
import { knownThemes } from '@vignettes/core/theme'
import { deckApi } from '~/api'
import { useCatalogCache } from '~/composables/useCatalog'
import { useFormModal } from '~/composables/useFormModal'

// Create-deck modal: the deck is born in the database (draft status) and opens
// in the editor. The slug is the user's to type; the wand fills it from the
// title on demand. `defaultProject` pre-selects a folder (folder-page create).
const props = defineProps<{ projects?: Project[], defaultProject?: string }>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

// A non-empty sentinel marks "none" in the project select (reka-ui forbids an
// empty-string SelectItem value); dropped at POST time.
const NONE = '__none__'

const { state, errorMessage, runIfValid } = useFormModal(
  open,
  () => ({ title: '', slug: '', project: props.defaultProject ?? NONE, theme: 'dsfr' }),
)

// Filling from the title is an explicit act (the wand), never automatic: the
// slug is the user's to choose.
function slugFromTitle() {
  state.slug = slugify(state.title, { lower: true, strict: true })
}

const slugValid = computed(() => state.slug === '' || isDeckSlug(state.slug))

const projectItems = computed(() => [
  { label: 'Sans projet', value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

const themeItems = knownThemes().map(name => ({ label: name, value: name }))

function close() {
  open.value = false
}

const { mutate: runCreate, isLoading: pending } = useMutation({
  mutation: () => deckApi.create($fetch, {
    slug: state.slug,
    title: state.title.trim(),
    ...(state.project !== NONE ? { project: state.project } : {}),
    ...(state.theme ? { theme: state.theme } : {}),
  }),
  async onSuccess() {
    open.value = false
    toast.add({ title: 'Présentation créée', description: state.title.trim(), icon: 'i-lucide-file-plus-2', color: 'success' })
    await invalidatePresentations()
    await navigateTo(`/edit/${state.slug}`)
  },
  onError(e: any) {
    errorMessage.value = e?.statusCode === 409
      ? `Le slug « ${state.slug} » est déjà pris.`
      : e?.statusMessage || 'Échec de la création'
  },
})

const canSubmit = computed(() => state.title.trim().length > 0 && isDeckSlug(state.slug) && !pending.value)

function submit() {
  runIfValid(canSubmit.value, runCreate)
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Nouvelle présentation"
    description="Un brouillon vierge, créé en base et ouvert dans l'éditeur."
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
            placeholder="Titre de la présentation"
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

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Projet">
            <USelect
              v-model="state.project"
              :items="projectItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Thème">
            <USelect
              v-model="state.theme"
              :items="themeItems"
              class="w-full"
            />
          </UFormField>
        </div>

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
          label="Créer et éditer"
          icon="i-lucide-file-plus-2"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
