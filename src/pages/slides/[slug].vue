<script setup lang="ts">
const route = useRoute()
const slug = route.params.slug as string

// Load presentation data
const { data: presentationData, error } = usePresentation(slug)
</script>

<template>
  <div class="presentation-page">
    <ClientOnly>
      <template v-if="presentationData && presentationData.slides.length > 0">
        <RevealPresentation
          :theme="presentationData.metadata.theme"
          :config="presentationData.metadata.reveal"
        >
          <RevealSlides :presentation-data="presentationData" />
        </RevealPresentation>
      </template>

      <template #fallback>
        <div class="loading">
          <p>Initializing presentation...</p>
        </div>
      </template>
    </ClientOnly>

    <div
      v-if="error"
      class="error-message"
    >
      <h1>Error Loading Presentation</h1>
      <p>{{ error.message || 'Failed to load presentation' }}</p>
      <NuxtLink to="/">
        ← Back to presentations
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.presentation-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.error-message {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100vh;
  text-align: center;
  padding: 2rem;
}

.error-message h1 {
  color: #e53e3e;
  margin-bottom: 1rem;
}

.error-message a {
  margin-top: 2rem;
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
}

.error-message a:hover {
  text-decoration: underline;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-size: 1.5rem;
  color: #666;
}
</style>
