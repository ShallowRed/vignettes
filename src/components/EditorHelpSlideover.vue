<script setup lang="ts">
import {
  ANNOTATION_SNIPPETS,
  COMPONENT_SNIPPETS,
  EDITOR_SHORTCUTS,
  FRONTMATTER_KEYS,
  LAYOUT_NAMES,
  STRUCTURE_HELP,
} from '~/config/editor-reference'

/**
 * Syntax reference panel: everything the engine understands, insertable in one
 * click. Same dataset as the autocompletion and the toolbar menu.
 */
const props = withDefaults(defineProps<{
  parser?: 'heading' | 'separator'
}>(), {
  parser: 'heading',
})

const emit = defineEmits<{ insert: [snippet: string] }>()

const open = defineModel<boolean>('open', { required: true })

const structure = computed(() => STRUCTURE_HELP[props.parser])
const otherParser = computed(() => (props.parser === 'heading' ? 'separator' : 'heading'))
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Aide du writer"
    description="Syntaxe, composants et options du moteur de slides."
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-rows-3"
              class="size-4"
            />
            Structure des diapos
          </h3>
          <p class="text-xs text-muted mb-2">
            Découpage actif : <code class="font-mono">parser: {{ parser }}</code>
            (frontmatter <code class="font-mono">parser: {{ otherParser }}</code> pour l'autre mode).
          </p>
          <ul class="flex flex-col gap-1">
            <li
              v-for="rule in structure"
              :key="rule"
              class="text-sm font-mono text-toned"
            >
              {{ rule }}
            </li>
          </ul>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-shapes"
              class="size-4"
            />
            Composants
          </h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="entry in COMPONENT_SNIPPETS"
              :key="entry.label"
              class="flex items-start gap-2 rounded-lg bg-elevated px-3 py-2"
            >
              <div class="flex-1 min-w-0">
                <code class="text-sm font-mono text-highlighted">{{ entry.label }}</code>
                <p class="text-xs text-muted mt-0.5">
                  {{ entry.description }}
                </p>
              </div>
              <UTooltip text="Insérer dans le document">
                <UButton
                  icon="i-lucide-corner-down-left"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Insérer"
                  @click="emit('insert', entry.snippet)"
                />
              </UTooltip>
            </li>
          </ul>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-at-sign"
              class="size-4"
            />
            Annotations de diapo
          </h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="entry in ANNOTATION_SNIPPETS"
              :key="entry.label"
              class="flex items-start gap-2 rounded-lg bg-elevated px-3 py-2"
            >
              <div class="flex-1 min-w-0">
                <code class="text-sm font-mono text-highlighted">{{ entry.label }}</code>
                <p class="text-xs text-muted mt-0.5">
                  {{ entry.description }}
                </p>
              </div>
              <UTooltip text="Insérer dans le document">
                <UButton
                  icon="i-lucide-corner-down-left"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Insérer"
                  @click="emit('insert', entry.snippet)"
                />
              </UTooltip>
            </li>
          </ul>
          <p class="text-xs text-muted mt-2">
            Layouts disponibles pour <code class="font-mono">:layout</code> :
          </p>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            <UBadge
              v-for="name in LAYOUT_NAMES"
              :key="name"
              color="neutral"
              variant="subtle"
              size="sm"
              class="font-mono"
              :label="name"
            />
          </div>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-file-cog"
              class="size-4"
            />
            Frontmatter
          </h3>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="entry in FRONTMATTER_KEYS"
              :key="entry.key"
              class="text-sm"
            >
              <code class="font-mono text-highlighted">{{ entry.key }}</code>
              <span
                v-if="entry.values"
                class="font-mono text-xs text-dimmed"
              > · {{ entry.values.join(' | ') }}</span>
              <p class="text-xs text-muted">
                {{ entry.description }}
              </p>
            </li>
          </ul>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-keyboard"
              class="size-4"
            />
            Raccourcis
          </h3>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="entry in EDITOR_SHORTCUTS"
              :key="entry.description"
              class="flex items-center gap-2 text-sm"
            >
              <UKbd
                v-for="key in entry.keys"
                :key="key"
                :value="key"
              />
              <span class="text-muted">{{ entry.description }}</span>
            </li>
          </ul>
          <p class="text-xs text-muted mt-2">
            L'autocomplétion se déclenche sur <code class="font-mono">::</code>,
            <code class="font-mono">:</code> et dans le frontmatter.
          </p>
        </section>
      </div>
    </template>
  </USlideover>
</template>
