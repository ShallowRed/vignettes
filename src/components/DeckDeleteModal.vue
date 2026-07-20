<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'

// Delete confirmation. Moves the deck to the trash (reversible); it can be
// restored or permanently erased from there.
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
      title: 'Présentation placée dans la corbeille',
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
    title="Placer dans la corbeille ?"
    :description="item.title"
  >
    <template #body>
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-trash-2"
        title="Réversible"
        description="La présentation part dans la corbeille. Tu pourras la restaurer, ou la supprimer définitivement depuis la corbeille."
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
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
