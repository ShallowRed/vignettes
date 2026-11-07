<script setup lang="ts">
import type { SlideBrand } from '@vignettes/core/render'

// The header of a slide that carries the bloc marque of the French state, in
// the markup of the DSFR `fr-logo`. `@vignettes/theme-kit` hides it, and the
// themes built on `@vignettes/theme-dsfr` show it.
defineProps<{ brand: SlideBrand }>()
</script>

<template>
  <div
    class="slide-brand"
    :data-on-dark="brand.onDark"
  >
    <p class="fr-logo slide-brand__mark">
      <template
        v-for="(line, index) in brand.lines"
        :key="index"
      >
        <br v-if="index > 0">{{ line }}
      </template>
    </p>
    <img
      v-if="brand.operator"
      class="slide-brand__operator"
      :src="brand.operator.src"
      :alt="brand.operator.alt"
    >
  </div>
</template>
