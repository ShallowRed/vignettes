<script setup lang="ts">
import type { Project } from '#shared/projects'
import type { DeckFileIssue } from '@vignettes/core/deck'
import { useMutation, useQuery } from '@pinia/colada'
import { isDeckSlug, readDeckFile } from '@vignettes/core/deck'
import { slugify } from '@vignettes/core/slugify'
import { getDefaultTheme, knownThemes } from '@vignettes/core/theme'
import { deckApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { useDerivedSlug } from '../composables/useDerivedSlug'
import { useFormModal } from '../composables/useFormModal'
import { templatesQuery } from '../queries'
import { requestErrorMessage } from '../utils/request-error'

// Create-deck modal: the deck is born in the database (draft status) and opens
// in the editor. It starts from a template, with the title and theme typed here,
// or from a Markdown file, whose frontmatter gives them. The slug follows the
// title until the user types one (`useDerivedSlug`). `defaultProject`
// pre-selects a folder (folder-page create).
const props = defineProps<{ projects?: Project[], defaultProject?: string }>()

const open = defineModel<boolean>('open', { required: true })

const { t, te } = useI18n()
const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

// A non-empty sentinel marks "none" in the project select (reka-ui forbids an
// empty-string SelectItem value); dropped at POST time.
const NONE = '__none__'
// The starting point that reads a Markdown file.
const FILE = '__file__'

const { data: templates } = useQuery({ ...templatesQuery($fetch), enabled: () => open.value })

const file = ref<File | null>(null)
const fileRaw = ref('')
const fileIssues = ref<DeckFileIssue[]>([])
const fileTitle = ref('')
const fileTheme = ref<string | undefined>(undefined)
// The slug the server refused as taken, shown on its field until it changes.
const takenSlug = ref('')

const { state, errorMessage, runIfValid, onReset } = useFormModal(
  open,
  () => ({ start: templates.value?.[0] ?? '', title: '', slug: '', project: props.defaultProject ?? NONE, theme: getDefaultTheme() }),
)
onReset(() => {
  file.value = null
  takenSlug.value = ''
})

watch(templates, (ids) => {
  const first = ids?.[0]
  if (!state.start && first)
    state.start = first
})

const fromFile = computed(() => state.start === FILE)
const title = computed(() => (fromFile.value ? fileTitle.value : state.title).trim())
const { slug, fill: fillSlug } = useDerivedSlug(state, () => title.value, value => slugify(value, { lower: true, strict: true }))
onReset(fillSlug)

function startLabel(id: string, part: 'label' | 'description') {
  const key = `catalog.deckCreate.start.${id}.${part}`
  return te(key) ? t(key) : part === 'label' ? id : undefined
}

const startItems = computed(() => [
  ...(templates.value ?? []).map(id => ({ value: id, label: startLabel(id, 'label'), description: startLabel(id, 'description') })),
  { value: FILE, label: t('catalog.deckCreate.start.file.label'), description: t('catalog.deckCreate.start.file.description') },
])

// The file is read here with the reading the server applies, so a refused
// frontmatter shows before the submit and the slug has a title to follow.
watch(file, async (chosen) => {
  fileRaw.value = ''
  fileIssues.value = []
  fileTitle.value = ''
  fileTheme.value = undefined
  if (!chosen)
    return
  fileRaw.value = await chosen.text()
  const reading = readDeckFile(fileRaw.value)
  if (!reading.valid) {
    fileIssues.value = reading.issues
    return
  }
  fileTitle.value = reading.meta.title
  fileTheme.value = reading.meta.theme
})

function issuesMessage(issues: DeckFileIssue[]): string {
  const yaml = issues.find(issue => issue.key === '')
  if (yaml)
    return t('catalog.deckCreate.import.yamlInvalid', { message: yaml.message })
  const keys = issues.map(issue => issue.key)
  if (keys.includes('title') && keys.length === 1)
    return t('catalog.deckCreate.import.titleMissing')
  return t('catalog.deckCreate.import.keysInvalid', { keys: keys.join(', ') }, keys.length)
}

const fileError = computed(() => fileIssues.value.length ? issuesMessage(fileIssues.value) : '')

const slugValid = computed(() => state.slug === '' || isDeckSlug(state.slug))
const slugError = computed(() => {
  if (!slugValid.value)
    return t('catalog.form.slugInvalid')
  return state.slug && state.slug === takenSlug.value ? t('catalog.form.addressTaken', { slug: state.slug }) : undefined
})

const projectItems = computed(() => [
  { label: t('catalog.project.none'), value: NONE },
  ...(props.projects ?? []).map(p => ({ label: p.title ?? p.slug, value: p.slug })),
])

const themeItems = knownThemes().map(name => ({ label: name, value: name }))

function close() {
  open.value = false
}

const project = computed(() => state.project !== NONE ? { project: state.project } : {})

const { mutate: runCreate, isLoading: pending } = useMutation({
  mutation: () => deckApi.create($fetch, fromFile.value
    ? { slug: state.slug, raw: fileRaw.value, ...project.value }
    : { slug: state.slug, title: title.value, template: state.start, ...project.value, ...(state.theme ? { theme: state.theme } : {}) }),
  async onSuccess() {
    open.value = false
    toast.add({ title: t('catalog.deckCreate.created'), description: title.value, icon: 'i-lucide-file-plus-2', color: 'success' })
    await invalidatePresentations()
    await navigateTo(`/edit/${state.slug}`)
  },
  onError(e: any) {
    if (e?.statusCode === 409) {
      takenSlug.value = state.slug
      return
    }
    const issues = e?.data?.data?.issues as DeckFileIssue[] | undefined
    errorMessage.value = issues?.length
      ? issuesMessage(issues)
      : requestErrorMessage(e, t('catalog.form.createFailed'))
  },
})

// What the form still needs before it can be sent; the fields that hold an
// error show it.
const blockedReason = computed(() => {
  if (fromFile.value && !fileRaw.value)
    return t('catalog.form.missing.file')
  if (fromFile.value && fileIssues.value.length > 0)
    return t('catalog.form.missing.fileInvalid')
  if (!state.start)
    return t('catalog.form.missing.start')
  if (!title.value)
    return t('catalog.form.missing.title')
  if (!state.slug)
    return t('catalog.form.missing.address')
  if (!isDeckSlug(state.slug) || slugError.value)
    return t('catalog.form.missing.addressInvalid')
  return undefined
})

function submit() {
  runIfValid(!blockedReason.value && !pending.value, runCreate)
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('common.actions.newDeck')"
    :description="t('catalog.deckCreate.description')"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField :label="t('catalog.deckCreate.start.label')">
          <URadioGroup
            v-model="state.start"
            :items="startItems"
            variant="card"
            :ui="{ fieldset: 'gap-2' }"
            :aria-label="t('catalog.deckCreate.start.label')"
          />
        </UFormField>

        <UFormField
          v-if="fromFile"
          :error="fileError || undefined"
        >
          <UFileUpload
            v-model="file"
            accept=".md,.markdown"
            layout="list"
            position="inside"
            icon="i-lucide-file-text"
            :label="t('catalog.deckCreate.import.dropLabel')"
            :description="t('catalog.deckCreate.import.dropDescription')"
            :file-image="false"
            class="w-full"
            :ui="{ base: 'data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/5' }"
          />
        </UFormField>

        <UFormField
          :label="t('common.fields.title')"
          :help="fromFile ? t('catalog.deckCreate.import.fromFile') : undefined"
          required
        >
          <UInput
            v-if="fromFile"
            :model-value="fileTitle"
            disabled
            class="w-full"
          />
          <UInput
            v-else
            v-model="state.title"
            :placeholder="t('catalog.deckCreate.titlePlaceholder')"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('common.fields.address')"
          :error="slugError"
          :help="t('catalog.form.deckAddressHelp', { slug: state.slug || '…' })"
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
              :disabled="!title"
              @click="fillSlug"
            />
          </div>
        </UFormField>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField :label="t('catalog.fields.project')">
            <USelect
              v-model="state.project"
              :items="projectItems"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('catalog.fields.theme')">
            <UInput
              v-if="fromFile"
              :model-value="fileTheme ?? t('catalog.deckCreate.import.defaultTheme', { theme: getDefaultTheme() })"
              disabled
              class="w-full"
            />
            <USelect
              v-else
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
      <FormModalFooter
        :label="t('catalog.deckCreate.submit')"
        icon="i-lucide-file-plus-2"
        :loading="pending"
        :blocked-reason="blockedReason"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </UModal>
</template>
