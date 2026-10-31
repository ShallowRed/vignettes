<script lang="ts" setup>
import type { DeckPreview } from '#shared/presentations'
import { previewTokens } from '#shared/presentations'

// The link preview image of a deck: its title slide, in the colors its theme
// declares for previews, with the mark of the favicon in a corner.
const props = defineProps<DeckPreview>()

const tokens = computed(() => previewTokens(props))
</script>

<template>
  <div
    class="w-full h-full flex flex-col justify-center px-[108px]"
    :style="{ backgroundColor: tokens.surface ?? '#ffffff', fontFamily: tokens.fontFamily }"
  >
    <p
      v-if="pretitle"
      class="m-0 mb-[20px] text-[30px] leading-[1.3]"
      :style="{ color: tokens.textColor ?? '#3a3a3a' }"
    >
      {{ pretitle }}
    </p>
    <h1
      class="m-0 text-[76px] font-extrabold leading-[1.08] tracking-[-0.02em]"
      :style="{ color: tokens.titleColor ?? '#161616' }"
    >
      {{ title }}
    </h1>
    <p
      v-if="subtitle"
      class="m-0 mt-[24px] text-[30px] leading-[1.3]"
      :style="{ color: tokens.textColor ?? '#3a3a3a' }"
    >
      {{ subtitle }}
    </p>
    <div class="absolute bottom-[40px] right-[48px] flex items-center gap-[4px] w-[48px] h-[48px] rounded-[10px] bg-[#dbeafe] px-[6px]">
      <div class="w-[17px] h-[22px] bg-[#2563eb]" />
      <div class="w-[9px] h-[22px] bg-[#2563eb] opacity-50" />
      <div class="w-[5px] h-[22px] bg-[#2563eb] opacity-50" />
    </div>
  </div>
</template>
