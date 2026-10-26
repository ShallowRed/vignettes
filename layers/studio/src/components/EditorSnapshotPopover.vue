<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { useSnapshotCapture } from '../composables/useSnapshotCapture'
import { historyQuery } from '../queries'

/**
 * The state of the shared draft in the editor's header. The button opens a
 * panel with the time of the last snapshot and a form that captures one with a
 * name; `capture` takes one without a name (⌘S). Until the connection is up,
 * the server may hold an older text than the editor, so nothing is captured.
 */
const props = defineProps<{
  slug: string
  /** What the header shows of the draft's state. */
  indicator: { icon: string, class: string, labelClass: string, label: string }
  offline?: boolean
}>()

const { t, locale } = useI18n()
const toast = useToast()

const open = ref(false)
const listQ = useQuery({ ...historyQuery($fetch, props.slug), enabled: () => open.value })
const lastSnapshot = computed(() => listQ.data.value?.find(e => e.kind === 'snapshot') ?? null)
const when = (at: number) => new Date(at).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })

// After a capture the indicator names it for a moment.
const FLASH_MS = 2000
const flashing = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(flashTimer))
const shown = computed(() => flashing.value
  ? { icon: 'i-lucide-camera', class: 'text-success', labelClass: 'text-success', label: t('deck.history.snapshotCaptured') }
  : props.indicator)

const { capture: send, capturing } = useSnapshotCapture(props.slug, (kept) => {
  open.value = false
  if (!kept)
    return
  clearTimeout(flashTimer)
  flashing.value = true
  flashTimer = setTimeout(() => flashing.value = false, FLASH_MS)
})

function capture(name?: string) {
  if (props.offline) {
    toast.add({ title: t('editor.collab.offline'), description: t('deck.history.snapshotOffline'), icon: 'i-lucide-cloud-off', color: 'error' })
    return
  }
  send(name)
}

defineExpose({ capture: () => capture() })
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'end' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="shrink-0 gap-1.5 max-sm:px-1.5"
      :aria-label="`${shown.label}, ${t('deck.history.captureSnapshot')}`"
    >
      <UIcon
        :name="shown.icon"
        class="size-4.5 shrink-0"
        :class="shown.class"
      />
      <span
        class="hidden sm:inline text-xs"
        :class="shown.labelClass"
      >{{ shown.label }}</span>
    </UButton>

    <template #content>
      <div class="grid w-80 gap-3 p-3 text-sm">
        <div class="grid gap-0.5">
          <p class="font-medium text-highlighted">
            {{ indicator.label }}
          </p>
          <p class="text-xs text-muted">
            {{ offline ? t('deck.history.snapshotOffline') : t('editor.collab.hint') }}
          </p>
          <p class="min-h-4 text-xs text-muted">
            <template v-if="listQ.data.value">
              {{ lastSnapshot ? t('deck.history.lastSnapshot', { when: when(lastSnapshot.at) }) : t('deck.history.noSnapshot') }}
            </template>
          </p>
        </div>
        <SnapshotNameForm
          v-if="!offline"
          :loading="capturing"
          @capture="capture"
        >
          <template #end>
            <span class="ms-auto flex items-center gap-0.5">
              <UKbd value="meta" />
              <UKbd value="S" />
            </span>
          </template>
        </SnapshotNameForm>
      </div>
    </template>
  </UPopover>
</template>
