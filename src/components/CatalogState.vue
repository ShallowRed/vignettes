<script setup lang="ts">
// Loading / error / empty placeholder for the catalog view.
defineProps<{
  state: 'pending' | 'error' | 'empty'
  message?: string
}>()
</script>

<template>
  <div
    v-if="state === 'pending'"
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  >
    <USkeleton
      v-for="i in 6"
      :key="i"
      class="h-36 rounded-lg"
    />
  </div>

  <UAlert
    v-else-if="state === 'error'"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    title="Échec du chargement des présentations"
    :description="message"
  />

  <UEmpty
    v-else
    icon="i-lucide-presentation"
    :title="message || 'Aucune présentation trouvée'"
    description="Ajoutez des fichiers .md dans le dossier presentations/."
    variant="naked"
    size="lg"
  />
</template>
