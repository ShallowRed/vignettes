<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'

// Delete confirmation: a file-backed deck reverts to its committed markdown
// (the database only shadows it); an app-created deck disappears for good.
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
      title: props.item.fileBacked ? 'Données en base supprimées' : 'Présentation supprimée',
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
    :title="item.fileBacked ? 'Réinitialiser depuis le fichier ?' : 'Supprimer la présentation ?'"
    :description="item.title"
  >
    <template #body>
      <UAlert
        v-if="item.fileBacked"
        color="warning"
        variant="subtle"
        icon="i-lucide-history"
        title="Ce deck a un fichier committé derrière lui"
        description="Brouillon, versions publiées, réglages et partages en base seront supprimés ; le deck reviendra à la version du fichier."
      />
      <UAlert
        v-else
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Suppression définitive"
        description="Ce deck n'existe qu'en base : brouillon, versions publiées et partages seront perdus. Aucun fichier ne le fera revivre."
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
          :label="item.fileBacked ? 'Réinitialiser' : 'Supprimer'"
          color="error"
          icon="i-lucide-trash-2"
          :loading="pending"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
