<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'

// Delete confirmation. The database is the source of truth, so this is permanent.
const props = defineProps<{ item: PresentationListItem }>()

const emit = defineEmits<{ deleted: [] }>()

const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const pending = ref(false)

function close() {
  open.value = false
}

async function confirm() {
  pending.value = true
  try {
    await $fetch(`/api/presentations/${props.item.slug}`, { method: 'DELETE' })
    open.value = false
    toast.add({
      title: 'Présentation supprimée',
      description: props.item.title,
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
    title="Supprimer la présentation ?"
    :description="item.title"
  >
    <template #body>
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Suppression définitive"
        description="Brouillon, versions publiées, réglages et partages seront perdus. Cette action est irréversible."
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
          label="Supprimer"
          color="error"
          icon="i-lucide-trash-2"
          :loading="pending"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
