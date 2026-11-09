<script setup lang="ts">
definePageMeta({ layout: false })

const { t } = useI18n()
const { umami, errorTracking, privacyContact } = useRuntimeConfig().public

const measures = Boolean(umami.host)
const reportsErrors = Boolean(errorTracking.dsn)

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('privacy.title') },
])
useHead({ title: () => t('privacy.title') })
</script>

<template>
  <NuxtLayout
    name="default"
    :breadcrumb="breadcrumb"
  >
    <div class="flex max-w-prose flex-col gap-6">
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('privacy.title') }}
      </h1>
      <p v-if="!measures && !reportsErrors">
        {{ t('privacy.nothingMeasured') }}
      </p>
      <section
        v-if="measures"
        class="flex flex-col gap-2"
      >
        <h2 class="font-semibold text-highlighted">
          {{ t('privacy.audience.title') }}
        </h2>
        <p>{{ t('privacy.audience.collected') }}</p>
        <p>{{ t('privacy.audience.pages') }}</p>
        <p>{{ t('privacy.audience.limits') }}</p>
        <p v-if="umami.retentionMonths">
          {{ t('privacy.audience.retention', Number(umami.retentionMonths)) }}
        </p>
      </section>
      <section
        v-if="reportsErrors"
        class="flex flex-col gap-2"
      >
        <h2 class="font-semibold text-highlighted">
          {{ t('privacy.errors.title') }}
        </h2>
        <p>{{ t('privacy.errors.collected') }}</p>
        <p v-if="errorTracking.retentionDays">
          {{ t('privacy.errors.retention', Number(errorTracking.retentionDays)) }}
        </p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-highlighted">
          {{ t('privacy.cookies.title') }}
        </h2>
        <p>{{ t('privacy.cookies.list') }}</p>
      </section>
      <p v-if="privacyContact">
        {{ t('privacy.contact', { contact: privacyContact }) }}
      </p>
    </div>
  </NuxtLayout>
</template>
