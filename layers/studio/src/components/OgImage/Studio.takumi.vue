<script lang="ts" setup>
// The link preview image of the studio pages: the icon, the name of the product,
// the name of the instance and a line of text.
defineProps<{ description?: string, instanceName?: string }>()
</script>

<template>
  <div
    class="w-full h-full flex flex-col justify-center bg-[#f8fafc] px-[96px]"
    style="font-family: 'Lexend Deca'"
  >
    <div class="flex items-center gap-[24px] mb-[36px]">
      <VignettesIcon :size="88" />
      <span class="text-[72px] font-bold text-[#0f172a]">Vignettes</span>
      <span
        v-if="instanceName"
        class="text-[72px] text-[#64748b]"
      >{{ instanceName }}</span>
    </div>
    <p
      v-if="description"
      class="m-0 text-[36px] leading-[1.35] text-[#334155] max-w-[900px]"
    >
      {{ description }}
    </p>
  </div>
</template>
