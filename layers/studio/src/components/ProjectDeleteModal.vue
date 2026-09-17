<script setup lang="ts">
import { useMutation } from '@pinia/colada'
import { projectApi } from '../api'
import { useCatalogCache } from '../composables/useCatalog'

// Delete a project: it and all its decks move to the trash together (reversible).
// Optimistic — the folder and its decks vanish from the catalog immediately,
// rolling back if the request fails.
const props = defineProps<{ project: { slug: string, title: string }, deckCount: number }>()
const emit = defineEmits<{ deleted: [] }>()

const open = defineModel<boolean>('open', { required: true })

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
      title: 'Dossier placé dans la corbeille',
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
    toast.add({ title: error?.statusMessage || 'Échec de la suppression', icon: 'i-lucide-triangle-alert', color: 'error' })
  },
  onSettled: invalidateAll,
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Supprimer le dossier ?"
    :description="project.title"
  >
    <template #body>
      <ActionNotice
        icon="i-lucide-trash-2"
        title="Le dossier et son contenu partent à la corbeille"
        :description="deckCount > 0
          ? `Ce dossier et ses ${deckCount} présentation${deckCount > 1 ? 's' : ''} seront placés dans la corbeille. Tu pourras tout restaurer d'un coup.`
          : 'Ce dossier (vide) sera placé dans la corbeille. Tu pourras le restaurer.'"
      />
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
          label="Mettre à la corbeille"
          color="warning"
          icon="i-lucide-trash-2"
          :loading="pending"
          @click="() => confirm()"
        />
      </div>
    </template>
  </UModal>
</template>
