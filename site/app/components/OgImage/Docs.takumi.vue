<script lang="ts" setup>
// The preview image of a documentation page, in place of the one of Docus: the
// mark of the favicon, the section and the title of the page. The description
// stays out: Docus removes its commas to fit it in the image address.
const { title, headline } = defineProps<{ title?: string, description?: string, headline?: string }>()
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between bg-[#f8fafc] px-[80px] py-[64px]">
    <div class="flex items-center gap-[16px]">
      <div class="flex items-center gap-[4px] w-[56px] h-[56px] rounded-[12px] bg-[#dbeafe] px-[7px]">
        <div class="w-[20px] h-[26px] bg-[#2563eb]" />
        <div class="w-[11px] h-[26px] bg-[#2563eb] opacity-50" />
        <div class="w-[6px] h-[26px] bg-[#2563eb] opacity-50" />
      </div>
      <span class="text-[28px] font-bold text-[#0f172a]">Vignettes</span>
    </div>

    <div class="flex flex-col max-w-[920px]">
      <p
        v-if="headline"
        class="m-0 mb-[20px] text-[24px] font-bold uppercase tracking-[0.05em] text-[#2563eb]"
      >
        {{ headline }}
      </p>
      <h1
        v-if="title"
        class="m-0 text-[76px] font-bold leading-[1.1] text-[#0f172a]"
      >
        {{ title }}
      </h1>
    </div>

    <span class="text-[22px] text-[#64748b]">vignettes.io</span>
  </div>
</template>
