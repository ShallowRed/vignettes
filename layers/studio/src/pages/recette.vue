<script setup lang="ts">
import type { RecettePersona } from '#shared/recette/personas'
import { RECETTE_INVITED_HANDLE, RECETTE_PASSWORD, RECETTE_PREFIX } from '#shared/recette/personas'

/**
 * Staging acceptance kit (owner only, staging and dev): reset the `recette-*`
 * data set, open the app as a persona, follow the scenario checklists. The
 * server refuses everything outside staging/dev, so this page then reads 404.
 */
interface Status {
  owner: string
  current: { login: string | null, role: string }
  seeded: boolean
  personas: RecettePersona[]
  /** Address of the image seeded into a deck, by deck slug. */
  images: Record<string, string>
}

const { t } = useI18n()
const requestFetch = useRequestFetch()
const { data, error, refresh } = await useAsyncData('recette-status', () => requestFetch<Status>('/api/recette/status'))
const statusCode = computed(() => (error.value as any)?.statusCode as number | undefined)
const toast = useToast()

const seeding = ref(false)
async function seed() {
  seeding.value = true
  try {
    const summary = await $fetch<{ folders: number, decks: number, accounts: number }>('/api/recette/seed', { method: 'POST' })
    toast.add({ title: t('recette.dataset.resetDone'), description: t('recette.dataset.resetSummary', { decks: summary.decks, folders: summary.folders, accounts: summary.accounts }), icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || t('recette.dataset.resetFailed'), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    seeding.value = false
  }
}

const personaLink = (key: string, redirect = '/') => `/auth/recette?as=${key}&redirect=${encodeURIComponent(redirect)}`

interface Step {
  text: string
  to?: string
}

/** What each account must observe. Links open the page to check. */
const scenarios = computed<{ key: string, title: string, steps: Step[] }[]>(() => [
  {
    key: 'anonymous',
    title: t('recette.personas.anonymous.label'),
    steps: [
      { text: t('recette.scenarios.anonymous.catalog'), to: '/' },
      { text: t('recette.scenarios.anonymous.password', { password: RECETTE_PASSWORD }), to: '/slides/recette-mdp' },
      { text: t('recette.scenarios.anonymous.passwordOnce'), to: '/slides/recette-mdp' },
      { text: t('recette.scenarios.anonymous.private'), to: '/slides/recette-privee' },
      { text: t('recette.scenarios.anonymous.unlisted'), to: '/slides/recette-non-listee' },
      { text: t('recette.scenarios.anonymous.trashed'), to: '/slides/recette-corbeille' },
      { text: t('recette.scenarios.anonymous.publicImage'), to: data.value?.images['recette-public'] },
      { text: t('recette.scenarios.anonymous.privateImage'), to: data.value?.images['recette-privee'] },
      { text: t('recette.scenarios.anonymous.code'), to: '/slides/recette-public#/3' },
      { text: t('recette.scenarios.anonymous.englishDeck'), to: '/slides/recette-english' },
    ],
  },
  {
    key: 'viewer',
    title: t('recette.personas.viewer.label'),
    steps: [
      { text: t('recette.scenarios.viewer.catalog'), to: '/' },
      { text: t('recette.scenarios.viewer.private'), to: '/slides/recette-privee' },
      { text: t('recette.scenarios.viewer.sharedFolder'), to: '/projects/recette-partage' },
    ],
  },
  {
    key: 'collab',
    title: t('recette.personas.collab.label'),
    steps: [
      { text: t('recette.scenarios.collab.sharedFolder'), to: '/projects/recette-partage' },
      { text: t('recette.scenarios.collab.sync'), to: '/edit/recette-public' },
      { text: t('recette.scenarios.collab.pasteImage'), to: '/edit/recette-public' },
      { text: t('recette.scenarios.collab.unpublished'), to: '/edit/recette-public' },
      { text: t('recette.scenarios.collab.password'), to: '/slides/recette-mdp' },
      { text: t('recette.scenarios.collab.readOnly'), to: '/' },
      { text: t('recette.scenarios.collab.private'), to: '/slides/recette-privee' },
    ],
  },
  {
    key: 'expired',
    title: t('recette.personas.expired.label'),
    steps: [
      { text: t('recette.scenarios.expired.catalog'), to: '/' },
      { text: t('recette.scenarios.expired.editorDenied'), to: '/edit/recette-public' },
    ],
  },
  {
    key: 'editor',
    title: t('recette.personas.editor.label'),
    steps: [
      { text: t('recette.scenarios.editor.catalog'), to: '/' },
      { text: t('recette.scenarios.editor.trash'), to: '/trash' },
      { text: t('recette.scenarios.editor.accountsDenied'), to: '/users' },
    ],
  },
  {
    key: 'owner',
    title: t('recette.personas.owner.label'),
    steps: [
      { text: t('recette.scenarios.owner.accounts', { handle: RECETTE_INVITED_HANDLE }), to: '/users' },
      { text: t('recette.scenarios.owner.sharedFolderAccess'), to: '/projects/recette-partage' },
      { text: t('recette.scenarios.owner.privateImage'), to: data.value?.images['recette-privee'] },
      { text: t('recette.scenarios.owner.language'), to: '/' },
    ],
  },
])

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('recette.page.title') },
])
useHead({ title: () => t('recette.page.pageTitle') })
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <UIcon
        name="i-lucide-flask-conical"
        class="size-5 text-warning"
      />
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('recette.page.title') }}
      </h1>
      <span class="text-sm text-muted">{{ t('recette.page.subtitle') }}</span>
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
      <UAlert
        icon="i-lucide-user"
        color="neutral"
        variant="subtle"
        :title="data.current.login
          ? t('recette.page.signedInAs', { login: data.current.login, role: data.current.role })
          : t('recette.page.signedInAsNobody', { role: data.current.role })"
        :description="t('recette.page.pass', { owner: data.owner })"
        :actions="data.current.login !== data.owner
          ? [{ label: t('recette.page.backToMyAccount'), icon: 'i-lucide-undo-2', to: personaLink('me', '/recette'), external: true }]
          : []"
      />

      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-database"
              class="size-4 text-muted"
            />
            <span class="font-medium">{{ t('recette.dataset.title') }}</span>
            <UBadge
              :color="data.seeded ? 'success' : 'neutral'"
              variant="subtle"
              :label="data.seeded ? t('recette.dataset.seeded') : t('recette.dataset.missing')"
            />
            <div class="flex-1" />
            <UButton
              :label="data.seeded ? t('recette.dataset.reset') : t('recette.dataset.create')"
              icon="i-lucide-refresh-cw"
              size="sm"
              :loading="seeding"
              @click="seed"
            />
          </div>
        </template>
        <i18n-t
          keypath="recette.dataset.description"
          tag="p"
          class="text-sm text-muted"
          scope="global"
        >
          <template #prefix>
            <code>{{ RECETTE_PREFIX }}</code>
          </template>
        </i18n-t>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon
              name="i-lucide-users"
              class="size-4 text-muted"
            />
            <span class="font-medium">{{ t('recette.personas.openAs') }}</span>
          </div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="persona in data.personas"
            :key="persona.key"
            class="flex items-start gap-4 py-3"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-highlighted">{{ t(persona.labelKey) }}</span>
                <UBadge
                  :label="persona.role"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
              </div>
              <p class="text-sm text-muted">
                {{ t(persona.summaryKey) }}
              </p>
            </div>
            <UButton
              :label="t('common.actions.signIn')"
              icon="i-lucide-log-in"
              color="neutral"
              variant="subtle"
              size="sm"
              :to="personaLink(persona.key)"
              external
            />
          </li>
          <li class="flex items-start gap-4 py-3">
            <div class="flex-1 min-w-0">
              <span class="font-medium text-highlighted">{{ t('recette.personas.anonymous.label') }}</span>
              <p class="text-sm text-muted">
                {{ t('recette.personas.anonymousHint') }}
              </p>
            </div>
            <UButton
              :label="t('common.actions.signOut')"
              icon="i-lucide-log-out"
              color="neutral"
              variant="subtle"
              size="sm"
              :to="personaLink('anonymous')"
              external
            />
          </li>
        </ul>
      </UCard>

      <UCard
        v-for="scenario in scenarios"
        :key="scenario.key"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <span class="font-medium">{{ scenario.title }}</span>
            <div class="flex-1" />
            <UButton
              :label="scenario.key === 'anonymous' ? t('common.actions.signOut') : t('common.actions.signIn')"
              :icon="scenario.key === 'anonymous' ? 'i-lucide-log-out' : 'i-lucide-log-in'"
              color="neutral"
              variant="ghost"
              size="xs"
              :to="personaLink(scenario.key, scenario.steps[0]?.to ?? '/')"
              external
            />
          </div>
        </template>
        <ol class="flex flex-col gap-2 list-decimal pl-5 text-sm">
          <li
            v-for="(step, i) in scenario.steps"
            :key="i"
          >
            <span>{{ step.text }}</span>
            <ULink
              v-if="step.to"
              :to="personaLink(scenario.key, step.to)"
              class="ml-2 text-primary"
              target="_blank"
              external
            >
              {{ t('recette.page.openStep') }}
            </ULink>
          </li>
        </ol>
      </UCard>
    </template>
  </div>
</template>
