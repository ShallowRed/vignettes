<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { projectApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'
import { requestErrorMessage } from '../utils/request-error'

// Delete a project: it and all its decks move to the trash together (reversible).
// Optimistic — the folder and its decks vanish from the catalog immediately,
// rolling back if the request fails.
const props = defineProps<{ project: { slug: string, title: string }, deckCount: number }>()
const emit = defineEmits<{ deleted: [] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { removeProjectOptimistic, restoreSnapshot, invalidateAll } = useCatalogCache()

function close() {
  open.value = false
}

const { mutate: confirm, isLoading: pending } = useMutation({
  mutation: () => projectApi.trash($fetch, props.project.slug),
  onMutate: () => removeProjectOptimistic(props.project.slug),
  onSuccess() {
    open.value = false
    toast.add({
      title: t('catalog.projectDelete.trashed'),
      description: props.project.title,
      icon: 'i-lucide-trash-2',
      color: 'success',
    })
    emit('deleted')
  },
  onError(error: any, _vars, snapshot) {
    // Roll the optimistic removal back, then surface the failure.
    if (snapshot)
      restoreSnapshot(snapshot)
    toast.add({ title: requestErrorMessage(error, t('catalog.projectDelete.failed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  },
  onSettled: invalidateAll,
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('catalog.projectDelete.title')"
    :description="project.title"
  >
    <template #body>
      <ActionNotice
        icon="i-lucide-trash-2"
        :title="t('catalog.projectDelete.noticeTitle')"
        :description="deckCount > 0
          ? t('catalog.projectDelete.noticeWithDecks', deckCount)
          : t('catalog.projectDelete.noticeEmpty')"
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
