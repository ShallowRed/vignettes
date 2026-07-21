<script setup lang="ts">
import type { Project } from '#shared/projects'
import { isDeckSlug } from '#shared/deck'
import { KNOWN_THEMES } from '#shared/theme'
import { useCatalogCache } from '~/composables/useCatalog'
import { slugify } from '~/utils/slugify'

// Create-deck modal: title drives the slug until the user edits it by hand;
// the deck is born in the database (draft status) and opens in the editor.
// `defaultProject` pre-selects a folder (creating from a project page).
const props = defineProps<{ projects?: Project[], defaultProject?: string }>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

// A non-empty sentinel marks "none" in the project select (reka-ui forbids an
// empty-string SelectItem value); dropped at POST time.
const NONE = '__none__'

const state = reactive({
  title: '',
  slug: '',
  project: NONE,
  theme: 'dsfr',
})
const slugEdited = ref(false)
const pending = ref(false)
const errorMessage = ref('')

watch(() => state.title, (title) => {
  if (!slugEdited.value)
    state.slug = slugify(title, { lower: true, strict: true })
})

watch(open, (now) => {
  if (now) {
    Object.assign(state, { title: '', slug: '', project: props.defaultProject ?? NONE, theme: 'dsfr' })
    slugEdited.value = false
    errorMessage.value = ''
  }
})

const slugValid = computed(() => state.slug === '' || isDeckSlug(state.slug))
const canSubmit = computed(() => state.title.trim().length > 0 && isDeckSlug(state.slug) && !pending.value)

const projectItems = computed(() => [
  { label: 'Sans projet', value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

const themeItems = KNOWN_THEMES.map(name => ({ label: name, value: name }))

function close() {
  open.value = false
}

async function submit() {
  if (!canSubmit.value)
    return
  pending.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/presentations', {
      method: 'POST',
      body: {
        slug: state.slug,
        title: state.title.trim(),
        ...(state.project !== NONE ? { project: state.project } : {}),
        ...(state.theme ? { theme: state.theme } : {}),
      },
    })
    open.value = false
    toast.add({ title: 'Présentation créée', description: state.title.trim(), icon: 'i-lucide-file-plus-2', color: 'success' })
    await invalidatePresentations()
    await navigateTo(`/edit/${state.slug}`)
  }
  catch (e: any) {
    errorMessage.value = e?.statusCode === 409
      ? `Le slug « ${state.slug} » est déjà pris.`
      : e?.statusMessage || 'Échec de la création'
  }
  finally {
    pending.value = false
  }
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
          help="Identifiant de l'URL (/slides/…) — dérivé du titre."
        >
          <UInput
            v-model="state.slug"
            placeholder="mon-slug"
            class="w-full font-mono"
            @input="slugEdited = true"
          />
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
