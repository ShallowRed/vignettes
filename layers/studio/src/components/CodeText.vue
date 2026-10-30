<script setup lang="ts">
import { codeParts } from '../utils/code-parts'

// A text whose spans between backticks show as code.
defineProps<{ text: string }>()
</script>

<template>
  <span>
    <template
      v-for="(part, index) in codeParts(text)"
      :key="index"
    >
      <code
        v-if="part.code"
        class="font-mono"
      >{{ part.text }}</code>
      <template v-else>
        {{ part.text }}
      </template>
    </template>
  </span>
</template>
