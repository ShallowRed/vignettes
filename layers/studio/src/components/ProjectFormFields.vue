<script setup lang="ts">
import type { ProjectIcon } from '#shared/projects'
import { PROJECT_ICONS } from '#shared/projects'
import { PROJECT_COLORS, projectSwatchStyle } from '../utils/project-colors'

// The fields of a folder, in its creation and its edit modals: the name, the
// address with the button that writes it from the name, the icon and the color.
defineProps<{
  addressHelp: string
  /** The label of the button that writes the address from the name. */
  regenerateLabel: string
  slugValid: boolean
  namePlaceholder?: string
  colorHelp?: string
}>()
const emit = defineEmits<{ regenerate: [] }>()
const title = defineModel<string>('title', { required: true })
const slug = defineModel<string>('slug', { required: true })
const icon = defineModel<ProjectIcon | null>('icon', { required: true })
const color = defineModel<string | null>('color', { required: true })
const { t } = useI18n()
</script>

<template>
  <UFormField
    :label="t('common.fields.name')"
    required
  >
    <UInput
      v-model="title"
      :placeholder="namePlaceholder"
      autofocus
      class="w-full"
    />
  </UFormField>

  <UFormField
    :label="t('common.fields.address')"
    :error="slugValid ? undefined : t('catalog.form.slugInvalid')"
    :help="addressHelp"
  >
    <div class="flex items-center gap-2">
      <UInput
        v-model="slug"
        :placeholder="t('common.fields.folderSlugPlaceholder')"
        class="flex-1 font-mono"
      />
      <UButton
        icon="i-lucide-wand-sparkles"
        color="neutral"
        variant="subtle"
        :aria-label="regenerateLabel"
        :disabled="!title.trim()"
        @click="emit('regenerate')"
      />
    </div>
  </UFormField>

  <UFormField :label="t('common.fields.icon')">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="i in PROJECT_ICONS"
        :key="i"
        type="button"
        class="grid place-items-center size-8 rounded-lg ring-2 transition bg-elevated"
        :class="(icon ?? 'folder') === i ? 'ring-primary' : 'ring-transparent'"
        :aria-label="i"
        @click="icon = i === 'folder' ? null : i"
      >
        <UIcon
          :name="`i-lucide-${i}`"
          class="size-4"
        />
      </button>
    </div>
  </UFormField>

  <UFormField
    :label="t('common.fields.color')"
    :help="colorHelp"
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition bg-muted"
        :class="color === null ? 'ring-primary' : 'ring-transparent'"
        :aria-label="t('common.fields.noColor')"
        @click="color = null"
      />
      <button
        v-for="c in PROJECT_COLORS"
        :key="c"
        type="button"
        class="size-7 rounded-full ring-2 ring-offset-2 ring-offset-default transition"
        :class="color === c ? 'ring-primary' : 'ring-transparent'"
        :style="projectSwatchStyle(c)"
        :aria-label="c"
        @click="color = c"
      />
    </div>
  </UFormField>
</template>
