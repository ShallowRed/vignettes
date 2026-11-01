<script setup lang="ts">
import type { TokenSummary } from '#shared/access'
import { loginHref } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { tokensApi } from '../api'
import { useAppSession } from '../composables/useAppSession'
import { tokensQuery } from '../queries'
import { tokenKeys } from '../queries/keys'
import { requestErrorMessage } from '../utils/request-error'
import { shortDate } from '../utils/short-date'

definePageMeta({ layout: false })

/**
 * The personal access tokens of the signed-in account: create one, read when
 * each was used and when it expires, revoke an active one, and remove a revoked
 * or expired one from the list.
 */
const { t, locale } = useI18n()
const { loggedIn } = useAppSession()
const toast = useToast()
const queryCache = useQueryCache()
const requestFetch = useRequestFetch()

const tokensQ = useQuery({ ...tokensQuery(requestFetch), enabled: () => loggedIn.value })
const tokens = computed<TokenSummary[]>(() => tokensQ.data.value ?? [])

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('account.tokens.title') },
])
useHead({ title: () => t('account.tokens.title') })

const date = (value: string) => shortDate(value, locale.value)

function details(token: TokenSummary): string[] {
  const end = token.state === 'revoked'
    ? t('account.tokens.revokedOn', { date: date(token.revokedAt!) })
    : t(token.state === 'expired' ? 'account.tokens.expiredOn' : 'account.tokens.expiresOn', { date: date(token.expiresAt) })
  return [
    t(`account.tokens.scope.${token.scope}`),
    t('account.tokens.createdOn', { date: date(token.createdAt) }),
    token.lastUsedAt ? t('account.tokens.lastUsed', { date: date(token.lastUsedAt) }) : t('account.tokens.neverUsed'),
    end,
  ]
}

const createOpen = ref(false)

// Revoking goes through a confirmation: the scripts that use the token stop working.
const revokeTarget = ref<TokenSummary | null>(null)
const revokeOpen = computed({
  get: () => revokeTarget.value !== null,
  set: (value: boolean) => {
    if (!value)
      revokeTarget.value = null
  },
})

const { mutate: remove, isLoading: removing } = useMutation({
  mutation: (id: number) => tokensApi.remove(requestFetch, id),
  onSuccess(result) {
    toast.add({ title: result.action === 'revoked' ? t('account.tokens.revoked') : t('account.tokens.removed'), icon: 'i-lucide-check', color: 'success' })
    revokeTarget.value = null
  },
  onError: error => toast.add({ title: requestErrorMessage(error, t('account.tokens.actionFailed')), icon: 'i-lucide-triangle-alert', color: 'error' }),
  onSettled: () => queryCache.invalidateQueries({ key: tokenKeys.all }),
})
</script>

<template>
  <NuxtLayout
    name="default"
    :breadcrumb="breadcrumb"
  >
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start gap-3">
        <div class="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-semibold text-highlighted">
              {{ t('account.tokens.title') }}
            </h1>
            <span
              v-if="loggedIn"
              class="text-sm text-muted whitespace-nowrap"
            >{{ t('account.tokens.count', tokens.length) }}</span>
          </div>
          <p class="text-sm text-muted">
            {{ t('account.tokens.intro') }}
          </p>
        </div>
        <UButton
          v-if="loggedIn"
          :label="t('account.tokens.create')"
          icon="i-lucide-key-round"
          size="sm"
          @click="createOpen = true"
        />
      </div>

      <UAlert
        v-if="!loggedIn"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('admin.access.restrictedTitle')"
        :description="t('account.tokens.restrictedDescription')"
        :actions="[{ label: t('common.actions.signIn'), to: loginHref('/tokens'), icon: 'i-lucide-log-in' }]"
      />

      <AsyncSection
        v-else
        :status="tokensQ.status.value"
        :error="tokensQ.error.value"
        :retry="() => tokensQ.refresh()"
        :empty="tokens.length === 0"
      >
        <template #pending>
          <div class="flex flex-col gap-2">
            <USkeleton
              v-for="i in 2"
              :key="i"
              class="h-14 rounded-lg"
            />
          </div>
        </template>

        <template #empty>
          <UEmpty
            icon="i-lucide-key-round"
            :title="t('account.tokens.emptyTitle')"
            :description="t('account.tokens.emptyDescription')"
            variant="naked"
          />
        </template>

        <ul class="flex flex-col gap-2">
          <li
            v-for="token in tokens"
            :key="token.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-elevated px-3 py-2"
          >
            <UIcon
              name="i-lucide-key-round"
              class="size-5 shrink-0"
              :class="token.state === 'active' ? 'text-dimmed' : 'text-dimmed/50'"
            />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span
                  class="font-medium truncate"
                  :class="token.state === 'active' ? 'text-highlighted' : 'text-muted'"
                >{{ token.name }}</span>
                <code class="font-mono text-xs text-muted">{{ token.prefix }}…</code>
                <UBadge
                  v-if="token.state !== 'active'"
                  :label="t(`account.tokens.state.${token.state}`)"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </p>
              <p class="text-xs text-muted">
                {{ details(token).join(' · ') }}
              </p>
            </div>
            <UButton
              v-if="token.state === 'active'"
              :label="t('account.tokens.revoke')"
              :aria-label="t('account.tokens.revokeOf', { name: token.name })"
              color="error"
              variant="ghost"
              size="xs"
              :disabled="removing"
              @click="revokeTarget = token"
            />
            <UTooltip
              v-else
              :text="t('account.tokens.removeOf', { name: token.name })"
            >
              <UButton
                icon="i-lucide-x"
                :aria-label="t('account.tokens.removeOf', { name: token.name })"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="removing"
                @click="remove(token.id)"
              />
            </UTooltip>
          </li>
        </ul>
      </AsyncSection>

      <TokenCreateModal v-model:open="createOpen" />

      <UModal
        v-model:open="revokeOpen"
        :title="t('account.tokens.revokeConfirmTitle')"
        :description="revokeTarget ? `${revokeTarget.name} · ${revokeTarget.prefix}…` : undefined"
      >
        <template #body>
          <ActionNotice
            tone="critical"
            :title="t('account.tokens.revokeConfirmNotice')"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              @click="revokeTarget = null"
            />
            <UButton
              :label="t('account.tokens.revokeConfirmAction')"
              color="error"
              icon="i-lucide-key-round"
              :loading="removing"
              @click="revokeTarget && remove(revokeTarget.id)"
            />
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>
