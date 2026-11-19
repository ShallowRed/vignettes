<script setup lang="ts">
import type { CapturedRecetteQuestion, RecetteCapture, RecetteStep } from '#shared/recette/branch'
import type { RecetteWidth } from '#shared/recette/captures'
import { RECETTE_VIEWPORTS, RECETTE_WIDTHS } from '#shared/recette/captures'

// One question of a branch recette: the question, its captures at each width,
// the gestures played before them, and the page to open as its account.
const props = defineProps<{
  question: CapturedRecetteQuestion
}>()

const emit = defineEmits<{ open: [] }>()
const { t } = useI18n()

const account = computed(() => props.question.account === 'owner' ? undefined : t(`recette.personas.${props.question.account}.label`))

function stepLabel(step: RecetteStep): string {
  if ('click' in step)
    return t('recette.branch.clickStep', { target: 'text' in step.click ? step.click.text : step.click.name })
  if ('press' in step)
    return (step.repeat ?? 1) > 1 ? t('recette.branch.pressRepeatStep', { key: step.press, count: step.repeat }) : t('recette.branch.pressStep', { key: step.press })
  return t('recette.branch.typeStep', { text: step.type })
}

const captureUrl = (capture: RecetteCapture) => `/api/recette/captures/${capture.key}`
/** The proportions of the window a capture is taken in, which its frame keeps before it is taken. */
const ratio = (width: RecetteWidth) => `${RECETTE_VIEWPORTS[width].width} / ${RECETTE_VIEWPORTS[width].height}`
// Each column takes the share of its proportions, so the window captures of a question have the same height.
const columns = RECETTE_WIDTHS.map(width => `minmax(0, ${RECETTE_VIEWPORTS[width].width / RECETTE_VIEWPORTS[width].height}fr)`).join(' ')

// A question is stale when one of its captures is.
const stale = computed(() => RECETTE_WIDTHS.some(width => props.question.captures[width]?.stale))
</script>

<template>
  <li class="flex flex-col gap-3 py-5">
    <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="font-medium text-highlighted">
          {{ question.question }}
        </p>
        <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <code>{{ question.id }}</code>
          <span v-if="account">· {{ account }}</span>
          <UBadge
            v-if="stale"
            :label="t('recette.branch.captureStale')"
            color="warning"
            variant="subtle"
            size="sm"
          />
        </p>
      </div>
      <UButton
        :label="t('recette.branch.open')"
        icon="i-lucide-arrow-up-right"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="emit('open')"
      />
    </div>

    <div
      v-if="question.steps?.length"
      class="text-sm text-muted"
    >
      <span>{{ t('recette.branch.steps') }}</span>
      <ol class="mt-1 list-decimal ps-5">
        <li
          v-for="(step, index) in question.steps"
          :key="index"
        >
          {{ stepLabel(step) }}
        </li>
      </ol>
    </div>

    <div
      class="grid items-start gap-3"
      :style="{ gridTemplateColumns: columns }"
    >
      <figure
        v-for="width in RECETTE_WIDTHS"
        :key="width"
        class="flex flex-col gap-1"
      >
        <a
          v-if="question.captures[width]"
          :href="captureUrl(question.captures[width])"
          target="_blank"
          rel="noopener"
          class="block overflow-hidden rounded-md border border-default transition-colors hover:border-accented focus-visible:outline-2 focus-visible:outline-primary"
        >
          <img
            :src="captureUrl(question.captures[width])"
            :alt="t(`recette.branch.${width}`)"
            class="block h-auto w-full"
            :class="{ 'opacity-50': question.captures[width].stale }"
          >
        </a>
        <div
          v-else
          class="grid place-items-center rounded-md border border-dashed border-default text-xs text-muted"
          :style="{ aspectRatio: ratio(width) }"
        >
          {{ t('recette.branch.captureMissing') }}
        </div>
        <figcaption class="text-xs text-muted">
          {{ t(`recette.branch.${width}`) }}
        </figcaption>
      </figure>
    </div>
  </li>
</template>
