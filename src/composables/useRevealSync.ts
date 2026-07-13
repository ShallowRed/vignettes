// Lets MDC child components trigger a Reveal.js sync after dynamic DOM changes.
export function useRevealSync() {
  const sync = inject<() => void>('revealSync', () => {
    // No-op outside a RevealPresentation context.
  })

  const getInstance = inject<() => any>('revealInstance', () => null)

  return {
    sync,
    getInstance,
  }
}
