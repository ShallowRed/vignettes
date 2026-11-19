<script setup lang="ts">
import type { BranchRecetteAnswer } from '#shared/recette/branch'
import { loginHref } from '#shared/access'
import { openAs } from '../../utils/post-form'
import { requestErrorMessage } from '../../utils/request-error'

// The recette of a branch, in development: each question with its captures,
// which `mise run recette:capture` takes. The server answers 404 outside
// development, so this page then reads as disabled.
definePageMeta({ layout: false })

const { t } = useI18n()
const requestFetch = useRequestFetch()
const { data, error, refresh } = await useAsyncData('recette-branch', () => requestFetch<BranchRecetteAnswer>('/api/recette/branch'))
const statusCode = computed(() => (error.value as any)?.statusCode as number | undefined)
const toast = useToast()

const files = computed(() => data.value?.files ?? [])
const hasTrialDecks = computed(() => files.value.some(file => 'decks' in file && file.decks.length > 0))

const recreating = ref(false)
async function recreateBranchDecks() {
  recreating.value = true
  try {
    const summary = await $fetch<{ decks: number }>('/api/recette/branch', { method: 'POST' })
    toast.add({ title: t('recette.branch.recreateDone'), description: t('recette.branch.recreateSummary', summary), icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (e: any) {
    toast.add({ title: requestErrorMessage(e, t('recette.branch.recreateFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    recreating.value = false
  }
}

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('recette.page.title'), to: '/recette' },
  { label: t('recette.branch.title') },
])
useHead({ title: () => t('recette.branch.pageTitle') })
</script>

<template>
  <NuxtLayout
    name="default"
    :breadcrumb="breadcrumb"
  >
    <div class="flex flex-col gap-6">
      <div class="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <div class="min-w-0 sm:flex-1">
          <h1 class="text-xl font-semibold text-highlighted">
            {{ t('recette.branch.title') }}
          </h1>
          <p
            v-if="data?.branch"
            class="mt-1 text-sm text-muted"
          >
            {{ t('recette.branch.branch', { branch: data.branch }) }}
          </p>
        </div>
        <UButton
          v-if="hasTrialDecks"
          :label="t('recette.branch.recreate')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="subtle"
          size="sm"
          :loading="recreating"
          @click="recreateBranchDecks"
        />
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
        :actions="[{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: loginHref('/recette/branche') }]"
      />

      <template v-else-if="data">
        <p
          v-if="files.length === 0"
          class="text-sm text-muted"
        >
          {{ t('recette.branch.empty') }}
        </p>

        <section
          v-for="file in files"
          :key="file.path"
          class="flex flex-col"
        >
          <h2 class="text-sm font-medium text-muted">
            {{ 'title' in file ? file.title : file.path }}
          </h2>

          <UAlert
            v-if="'error' in file"
            icon="i-lucide-triangle-alert"
            color="error"
            variant="subtle"
            :title="t('recette.branch.invalid')"
            :description="file.error"
            class="mt-3"
          />

          <template v-else>
            <UAlert
              v-if="file.decks.some(deck => !deck.exists)"
              icon="i-lucide-file-question"
              color="warning"
              variant="subtle"
              :title="t('recette.branch.missing', { slugs: file.decks.filter(deck => !deck.exists).map(deck => deck.slug).join(', ') })"
              class="mt-3"
            />
            <ul class="divide-y divide-default">
              <RecetteQuestion
                v-for="question in file.questions"
                :key="question.id"
                :question="question"
                @open="openAs(question.account, question.page, '_blank')"
              />
            </ul>
          </template>
        </section>
      </template>
    </div>
  </NuxtLayout>
</template>
