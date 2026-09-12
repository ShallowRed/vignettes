// Reloads presentation data on HMR events from the presentation-watcher Vite plugin.
export default defineNuxtPlugin(() => {
  if (import.meta.hot) {
    import.meta.hot.on('presentation-update', (data: { slug: string, filename: string }) => {
      const route = useRoute()

      if (route.path.startsWith('/slides/')) {
        const currentSlug = route.params.slug as string

        if (data.slug === currentSlug || data.filename.includes(currentSlug)) {
          console.log(`🔄 Refreshing presentation: ${currentSlug}`)
          refreshNuxtData(`presentation-${currentSlug}`)
        }
      }
    })
  }
})
