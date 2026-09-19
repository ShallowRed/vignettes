<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import { useMutation } from '@pinia/colada'
import { deckApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'

// Delete confirmation. Moves the deck to the trash (reversible); it can be
// restored or permanently erased from there.
const props = defineProps<{ item: PresentationListItem }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { invalidatePresentations } = useCatalogCache()

function close() {
  open.value = false
}

const { mutate: confirm, isLoading: pending } = useMutation({
  mutation: () => deckApi.trash($fetch, props.item.slug),
  onSuccess() {
    open.value = false
    toast.add({
      title: t('deck.delete.trashed'),
      description: props.item.title,
      icon: 'i-lucide-trash-2',
      color: 'success',
    })
  },
  onError(error: any) {
    toast.add({ title: error?.statusMessage || t('deck.delete.failed'), icon: 'i-lucide-triangle-alert', color: 'error' })
  },
  // Refetch the deck listing so the trashed deck disappears from the catalog.
  onSettled: invalidatePresentations,
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('deck.delete.title')"
    :description="item.title"
  >
    <template #body>
      <ActionNotice
        icon="i-lucide-trash-2"
        :title="t('deck.delete.noticeTitle')"
        :description="t('deck.delete.noticeDescription')"
      />
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          @click="close"
        />
        <UButton
          :label="t('common.actions.moveToTrash')"
          color="warning"
          icon="i-lucide-trash-2"
          :loading="pending"
          @click="() => confirm()"
        />
      </div>
    </template>
  </UModal>
</template>
