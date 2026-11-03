<script setup lang="ts">
// One check of the acceptance kit: its mark, the page it opens, the account
// that opens it when the list does not say, and the expected result.
defineProps<{
  target: string
  account?: string
  expect: string
}>()

const emit = defineEmits<{ open: [] }>()
const checked = defineModel<boolean>()
const { t } = useI18n()
</script>

<template>
  <li class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[auto_13rem_minmax(0,1fr)] sm:px-6">
    <UCheckbox
      v-model="checked"
      :aria-label="t('recette.page.checkStep')"
      class="mt-0.5"
    />
    <div class="flex min-w-0 flex-col">
      <ULink
        class="inline-flex items-center gap-1.5 text-start font-medium text-highlighted hover:text-primary"
        @click="emit('open')"
      >
        <span class="min-w-0 wrap-anywhere">{{ target }}</span>
        <UIcon
          name="i-lucide-arrow-up-right"
          class="size-3.5 shrink-0 text-muted"
        />
      </ULink>
      <span
        v-if="account"
        class="text-xs text-muted"
      >{{ account }}</span>
    </div>
    <span
      class="col-start-2 text-muted sm:col-start-3"
      :class="{ 'line-through opacity-60': checked }"
    >{{ expect }}</span>
  </li>
</template>
