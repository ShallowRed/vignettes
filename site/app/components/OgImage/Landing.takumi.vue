<script lang="ts" setup>
import VignettesIcon from '../../../../layers/studio/src/components/VignettesIcon.vue'

// The preview image of the home page, in place of the one of Docus: the icon,
// the name of the product, its promise and three slides.
const { description } = defineProps<{ title?: string, description?: string }>()
</script>

<template>
  <div class="w-full h-full flex items-center bg-[#f8fafc] px-[80px]">
    <div class="flex flex-col w-[560px]">
      <div class="flex items-center gap-[20px] mb-[32px]">
        <VignettesIcon :size="72" />
        <span class="text-[56px] font-bold text-[#0f172a]">Vignettes</span>
      </div>
      <p
        v-if="description"
        class="m-0 mb-[40px] text-[34px] leading-[1.35] text-[#334155]"
      >
        {{ description }}
      </p>
      <span class="text-[24px] text-[#64748b]">vignettes.io</span>
    </div>

    <div class="flex items-center gap-[20px] ml-auto">
      <div class="flex flex-col justify-center w-[300px] h-[200px] rounded-[12px] bg-white border-2 border-[#e2e8f0] px-[28px]">
        <div class="w-[180px] h-[18px] rounded-[4px] bg-[#000091] mb-[16px]" />
        <div class="w-[220px] h-[10px] rounded-[4px] bg-[#cbd5e1] mb-[10px]" />
        <div class="w-[160px] h-[10px] rounded-[4px] bg-[#cbd5e1]" />
      </div>
      <div class="w-[90px] h-[200px] rounded-[12px] bg-[#dbeafe]" />
      <div class="w-[40px] h-[200px] rounded-[12px] bg-[#dbeafe] opacity-60" />
    </div>
  </div>
</template>
