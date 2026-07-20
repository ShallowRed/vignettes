<script setup lang="ts">
// Delete a project: it and all its decks move to the trash together (reversible).
const props = defineProps<{ project: { slug: string, title: string }, deckCount: number }>()
const emit = defineEmits<{ deleted: [] }>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const pending = ref(false)

async function confirm() {
  pending.value = true
  try {
    await $fetch(`/api/admin/projects/${props.project.slug}`, { method: 'DELETE' })
    open.value = false
    toast.add({
      title: 'Dossier placé dans la corbeille',
      description: props.project.title,
      icon: 'i-lucide-trash-2',
      color: 'success',
    })
    emit('deleted')
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec de la suppression', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Supprimer le dossier ?"
    :description="project.title"
  >
    <template #body>
      <UAlert
        color="warning"
        variant="subtle"
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
          @click="open = false"
        />
        <UButton
          label="Mettre à la corbeille"
          color="warning"
          icon="i-lucide-trash-2"
          :loading="pending"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
