<script setup lang="ts">
import type { RecettePersona } from '#shared/recette/personas'
import { RECETTE_INVITED_HANDLE, RECETTE_PASSWORD, RECETTE_PREFIX } from '#shared/recette/personas'
import { requestErrorMessage } from '../utils/request-error'

/**
 * Staging acceptance kit (owner only, staging and dev): one block per account,
 * each with the pages to open as that account and what they must show. The
 * server refuses everything outside staging/dev, so this page then reads 404.
 */
interface Status {
  owner: string
  current: { login: string | null, role: string }
  seeded: boolean
  counts: { folders: number, decks: number, accounts: number }
  personas: RecettePersona[]
  /** Address of the image seeded into a deck, by deck slug. */
  images: Record<string, string>
}

const { t } = useI18n()
const requestFetch = useRequestFetch()
const { data, error, refresh } = await useAsyncData('recette-status', () => requestFetch<Status>('/api/recette/status'))
const statusCode = computed(() => (error.value as any)?.statusCode as number | undefined)
const toast = useToast()

// What was checked stays in this browser until the data set is reset.
const CHECKED_KEY = 'recette-checked'
const checked = ref<Record<string, boolean>>({})
onMounted(() => {
  checked.value = JSON.parse(localStorage.getItem(CHECKED_KEY) ?? '{}')
})
watch(checked, value => localStorage.setItem(CHECKED_KEY, JSON.stringify(value)), { deep: true })

const seeding = ref(false)
async function seed() {
  seeding.value = true
  try {
    const summary = await $fetch<Status['counts']>('/api/recette/seed', { method: 'POST' })
    toast.add({ title: t('recette.dataset.resetDone'), description: t('recette.dataset.resetSummary', summary), icon: 'i-lucide-check', color: 'success' })
    checked.value = {}
    await refresh()
  }
  catch (e: any) {
    toast.add({ title: requestErrorMessage(e, t('recette.dataset.resetFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    seeding.value = false
  }
}

const personaLink = (key: string, redirect = '/') => `/auth/recette?as=${key}&redirect=${encodeURIComponent(redirect)}`

interface Step {
  id: string
  target: string
  expect: string
  to?: string
}

interface Block {
  key: string
  label: string
  summary: string
  role?: string
  login: string | null
  steps: Step[]
}

/** The pages each account opens, from the least to the most privileged account. */
const blocks = computed<Block[]>(() => {
  const images = data.value?.images ?? {}
  const step = (block: string, id: string, target: string, to?: string, named: Record<string, unknown> = {}): Step =>
    ({ id, target: t(`recette.targets.${target}`), expect: t(`recette.steps.${block}.${id}`, named), to })
  const steps: Record<string, Step[]> = {
    anonymous: [
      step('anonymous', 'catalog', 'catalog', '/'),
      step('anonymous', 'password', 'deckPassword', '/slides/recette-mdp', { password: RECETTE_PASSWORD }),
      step('anonymous', 'passwordReload', 'deckPasswordReload', '/slides/recette-mdp'),
      step('anonymous', 'private', 'deckPrivate', '/slides/recette-privee'),
      step('anonymous', 'unlisted', 'deckUnlisted', '/slides/recette-non-listee'),
      step('anonymous', 'trashed', 'deckTrashed', '/slides/recette-corbeille'),
      step('anonymous', 'imagePublic', 'imagePublic', images['recette-public']),
      step('anonymous', 'imagePrivate', 'imagePrivate', images['recette-privee']),
      step('anonymous', 'code', 'deckPublicCode', '/slides/recette-public#/3'),
      step('anonymous', 'english', 'deckEnglish', '/slides/recette-english'),
    ],
    viewer: [
      step('viewer', 'catalog', 'catalog', '/'),
      step('viewer', 'private', 'deckPrivate', '/slides/recette-privee'),
      step('viewer', 'sharedFolder', 'sharedFolder', '/projects/recette-partage'),
    ],
    collab: [
      step('collab', 'sharedFolder', 'sharedFolder', '/projects/recette-partage'),
      step('collab', 'sync', 'editorPublic', '/edit/recette-public'),
      step('collab', 'pasteImage', 'editorPublic', '/edit/recette-public'),
      step('collab', 'unpublished', 'editorPublic', '/edit/recette-public'),
      step('collab', 'password', 'deckPassword', '/slides/recette-mdp'),
      step('collab', 'readOnly', 'catalog', '/'),
      step('collab', 'share', 'sharedFolder', '/projects/recette-partage'),
      step('collab', 'private', 'deckPrivate', '/slides/recette-privee'),
    ],
    expired: [
      step('expired', 'catalog', 'catalog', '/'),
      step('expired', 'editorDenied', 'editorPublic', '/edit/recette-public'),
    ],
    editor: [
      step('editor', 'catalog', 'catalog', '/'),
      step('editor', 'trash', 'trash', '/trash'),
      step('editor', 'accountsDenied', 'accounts', '/users'),
    ],
    owner: [
      step('owner', 'accounts', 'accounts', '/users', { handle: RECETTE_INVITED_HANDLE }),
      step('owner', 'sharedFolderAccess', 'sharedFolder', '/projects/recette-partage'),
      step('owner', 'imagePrivate', 'imagePrivate', images['recette-privee']),
      step('owner', 'language', 'home', '/'),
    ],
  }
  const personas = Object.fromEntries((data.value?.personas ?? []).map(persona => [persona.key, persona]))
  return Object.entries(steps).map(([key, list]) => ({
    key,
    label: t(`recette.personas.${key}.label`),
    summary: t(`recette.personas.${key}.summary`),
    role: personas[key]?.role,
    login: personas[key]?.login ?? null,
    steps: list,
  }))
})

const isCurrent = (block: Block) => (data.value?.current.login ?? null) === block.login

const doneIn = (block: Block) => block.steps.filter(step => checked.value[`${block.key}.${step.id}`]).length

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('recette.page.title') },
])
useHead({ title: () => t('recette.page.pageTitle') })
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div>
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('recette.page.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('recette.page.intro') }}
      </p>
    </div>

    <UAlert
      v-if="statusCode === 404"
      icon="i-lucide-eye-off"
      color="neutral"
      variant="subtle"
      :title="t('recette.page.disabled')"
    />

    <UAlert
      v-else-if="statusCode === 403 || statusCode === 401"
      icon="i-lucide-lock"
      color="warning"
      variant="subtle"
      :title="t('recette.page.ownerRequired')"
      :actions="[{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: '/login?redirect=/recette' }]"
    />

    <template v-else-if="data">
      <UCard :ui="{ body: 'grid gap-6 sm:grid-cols-2 sm:divide-x sm:divide-default' }">
        <div class="flex flex-col items-start gap-1">
          <span class="text-xs text-muted">{{ t('recette.page.session') }}</span>
          <span class="font-medium text-highlighted">
            {{ data.current.login ?? t('recette.page.sessionNone') }}
            <span
              v-if="data.current.login"
              class="font-normal text-muted"
            >· {{ data.current.role }}</span>
          </span>
          <span class="text-sm text-muted">{{ t('recette.page.pass', { owner: data.owner }) }}</span>
          <UButton
            v-if="data.current.login !== data.owner"
            :label="t('recette.page.backToMyAccount')"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="subtle"
            size="sm"
            class="mt-2"
            :to="personaLink('me', '/recette')"
            external
          />
        </div>

        <div class="flex flex-col items-start gap-1 sm:pl-6">
          <span class="text-xs text-muted">{{ t('recette.dataset.title') }}</span>
          <span class="font-medium text-highlighted">{{ data.seeded ? t('recette.dataset.seeded') : t('recette.dataset.missing') }}</span>
          <i18n-t
            keypath="recette.dataset.counts"
            tag="span"
            class="text-sm text-muted"
            scope="global"
          >
            <template #folders>
              {{ data.counts.folders }}
            </template>
            <template #decks>
              {{ data.counts.decks }}
            </template>
            <template #accounts>
              {{ data.counts.accounts }}
            </template>
            <template #prefix>
              <code>{{ RECETTE_PREFIX }}</code>
            </template>
          </i18n-t>
          <UButton
            :label="data.seeded ? t('recette.dataset.reset') : t('recette.dataset.create')"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="subtle"
            size="sm"
            class="mt-2"
            :loading="seeding"
            @click="seed"
          />
        </div>
      </UCard>

      <UCard
        v-for="block in blocks"
        :key="block.key"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <template #header>
          <div class="flex items-start gap-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium text-highlighted">{{ block.label }}</span>
                <UBadge
                  v-if="block.role"
                  :label="block.role"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <span class="text-xs text-muted tabular-nums">{{ t('recette.page.progress', { done: doneIn(block), total: block.steps.length }) }}</span>
              </div>
              <p class="text-sm text-muted">
                {{ block.summary }}
              </p>
            </div>
            <UBadge
              v-if="isCurrent(block)"
              :label="t('recette.page.currentSession')"
              color="primary"
              variant="subtle"
            />
            <UButton
              v-else
              :label="t('recette.page.openSession')"
              icon="i-lucide-log-in"
              color="neutral"
              variant="subtle"
              size="sm"
              :to="personaLink(block.key, '/recette')"
              external
            />
          </div>
        </template>

        <ul class="divide-y divide-default text-sm">
          <li
            v-for="step in block.steps"
            :key="step.id"
            class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[auto_13rem_minmax(0,1fr)] sm:px-6"
          >
            <UCheckbox
              v-model="checked[`${block.key}.${step.id}`]"
              :aria-label="t('recette.page.checkStep')"
              class="mt-0.5"
            />
            <ULink
              :to="step.to ? personaLink(block.key, step.to) : undefined"
              target="_blank"
              external
              class="inline-flex items-center gap-1.5 font-medium text-highlighted hover:text-primary"
            >
              {{ step.target }}
              <UIcon
                name="i-lucide-arrow-up-right"
                class="size-3.5 shrink-0 text-muted"
              />
            </ULink>
            <span
              class="col-start-2 text-muted sm:col-start-3"
              :class="{ 'line-through opacity-60': checked[`${block.key}.${step.id}`] }"
            >{{ step.expect }}</span>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
