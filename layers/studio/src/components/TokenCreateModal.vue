<script setup lang="ts">
import type { TokenScope } from '#shared/access'
import { DEFAULT_TOKEN_DAYS, TOKEN_DURATIONS } from '#shared/access'
import { useMutation, useQueryCache } from '@pinia/colada'
import { tokensApi } from '../api'
import { useFormModal } from '../composables/useFormModal'
import { tokenKeys } from '../queries/keys'
import { requestErrorMessage } from '../utils/request-error'

/**
 * Create a personal access token: a name, a scope and a duration. Once created,
 * the modal shows the secret with a copy button; the server keeps its hash only.
 * The secret lives in a local ref, emptied when the modal closes, and stays out
 * of the mutation's cached result.
 */
const open = defineModel<boolean>('open', { required: true })
const { t } = useI18n()
const toast = useToast()
const queryCache = useQueryCache()

const secret = ref<string | null>(null)
const copied = ref(false)
const { state, errorMessage, runIfValid, onReset } = useFormModal(
  open,
  () => ({ name: '', scope: 'write' as TokenScope, days: DEFAULT_TOKEN_DAYS }),
)
onReset(() => {
  secret.value = null
  copied.value = false
})
watch(open, (now) => {
  if (!now)
    secret.value = null
})

const scopeItems = computed(() => (['read', 'write'] as const).map(scope => ({
  value: scope,
  label: t(`account.tokens.scope.${scope}`),
  description: t(`account.tokens.scope.${scope}Description`),
})))
const durationItems = computed(() => TOKEN_DURATIONS.map(days => ({ value: days, label: t('account.tokens.form.days', { n: days }) })))

const { mutate: runCreate, isLoading: pending } = useMutation({
  async mutation() {
    const created = await tokensApi.create($fetch, { name: state.name.trim(), scope: state.scope, days: state.days })
    secret.value = created.secret
    return created.token
  },
  async onSuccess() {
    await queryCache.invalidateQueries({ key: tokenKeys.all })
  },
  onError(error: any) {
    errorMessage.value = error?.statusCode === 429
      ? t('account.tokens.form.tooMany')
      : requestErrorMessage(error, t('account.tokens.form.failed'))
  },
})

const canSubmit = computed(() => state.name.trim().length > 0 && !pending.value)

function submit() {
  runIfValid(canSubmit.value, runCreate)
}

const secretInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('secretInput')

async function copy() {
  if (!secret.value)
    return
  try {
    await navigator.clipboard.writeText(secret.value)
    copied.value = true
    toast.add({ title: t('account.tokens.created.copied'), icon: 'i-lucide-clipboard-check', color: 'success' })
  }
  catch {
    // A browser may refuse the clipboard: the selected token is then copied by hand.
    secretInput.value?.inputRef?.select()
    toast.add({ title: t('account.tokens.created.copyFailed'), icon: 'i-lucide-triangle-alert', color: 'warning' })
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="secret ? t('account.tokens.created.title') : t('account.tokens.create')"
    :description="secret ? undefined : t('account.tokens.form.description')"
    :dismissible="!secret"
    :close="!secret"
  >
    <template #body>
      <div
        v-if="secret"
        class="flex flex-col gap-4"
      >
        <ActionNotice :title="t('account.tokens.created.notice')" />
        <UFormField :label="t('account.tokens.created.secret')">
          <div class="flex items-center gap-2">
            <UInput
              ref="secretInput"
              :model-value="secret"
              readonly
              class="flex-1 min-w-0"
              :ui="{ base: 'font-mono text-xs' }"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="t('account.tokens.created.copy')"
              :ui="{ label: 'hidden sm:inline' }"
              :aria-label="t('account.tokens.created.copy')"
              color="neutral"
              variant="subtle"
              @click="copy"
            />
          </div>
        </UFormField>
        <div class="flex flex-col gap-1">
          <p class="text-sm text-muted">
            {{ t('account.tokens.created.usage') }}
          </p>
          <code class="rounded-md bg-elevated px-2 py-1 text-xs font-mono break-all">Authorization: Bearer {{ secret.slice(0, 12) }}…</code>
        </div>
      </div>

      <form
        v-else
        class="flex flex-col gap-4"
        @submit.prevent="submit"
      >
        <UFormField
          :label="t('account.tokens.form.name')"
          :help="t('account.tokens.form.nameHelp')"
          required
        >
          <UInput
            v-model="state.name"
            :placeholder="t('account.tokens.form.namePlaceholder')"
            maxlength="100"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('account.tokens.form.scope')">
          <URadioGroup
            v-model="state.scope"
            :items="scopeItems"
          />
        </UFormField>

        <UFormField :label="t('account.tokens.form.duration')">
          <USelect
            v-model="state.days"
            :items="durationItems"
            class="w-full"
          />
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
          v-if="secret"
          :label="t('account.tokens.created.done')"
          @click="() => { open = false }"
        />
        <template v-else>
          <UButton
            :label="t('common.actions.cancel')"
            color="neutral"
            variant="ghost"
            @click="() => { open = false }"
          />
          <UButton
            :label="t('account.tokens.form.submit')"
            icon="i-lucide-key-round"
            :loading="pending"
            :disabled="!canSubmit"
            @click="submit"
          />
        </template>
      </div>
    </template>
  </UModal>
</template>
