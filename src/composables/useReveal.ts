import type { Ref } from 'vue'
import type { RevealConfig } from '~/types/presentation'
import { EMBED_SANDBOX, mergeRevealConfig } from '@vignettes/core/render'

export function useReveal(
  container: Ref<HTMLElement | null>,
  config: Partial<RevealConfig> = {},
) {
  let revealInstance: any = null
  let overlayObserver: MutationObserver | null = null

  // Reveal's preview overlay creates its own iframe that escapes the sandbox we
  // put on inline embeds; without this a link clicked inside the lightbox could
  // navigate the whole window away. Apply EMBED_SANDBOX and reload under the policy.
  function sandboxOverlayIframes() {
    const root = container.value
    if (!root)
      return
    const iframes = root.querySelectorAll<HTMLIFrameElement>(
      '.r-overlay iframe:not([data-embed-sandboxed])',
    )
    iframes.forEach((iframe) => {
      iframe.setAttribute('sandbox', EMBED_SANDBOX)
      iframe.setAttribute('data-embed-sandboxed', '')
      // Re-trigger the load so the sandbox policy applies to the document.
      const src = iframe.getAttribute('src')
      if (src)
        iframe.setAttribute('src', src)
    })
  }

  function observeOverlays() {
    if (typeof window === 'undefined' || !container.value)
      return
    overlayObserver = new MutationObserver(() => sandboxOverlayIframes())
    overlayObserver.observe(container.value, { childList: true, subtree: true })
  }

  async function initialize() {
    if (!container.value)
      return

    // Dynamic import to avoid SSR issues.
    const { default: Reveal } = await import('reveal.js')
    // Speaker view (key S): reads each slide's `aside.notes`.
    const { default: RevealNotes } = await import('reveal.js/plugin/notes/notes.esm.js')

    // The import above yields to the event loop; a fast route change can unmount
    // the deck in that gap, nulling `container.value`. Constructing Reveal then
    // makes it fall back to `document.querySelector('.reveal')` — gone too — which
    // logs "Unable to find presentation root" and crashes reading `.slides`.
    if (!container.value)
      return

    const mergedConfig = mergeRevealConfig(config)

    revealInstance = new Reveal(container.value, { ...mergedConfig, plugins: [RevealNotes] })
    await revealInstance.initialize()

    // Sync to pick up Vue-rendered content (lightbox, previews, fragments won't
    // work otherwise since it renders after mount).
    revealInstance.sync()

    observeOverlays()

    return revealInstance
  }

  // Call after dynamically adding/removing slides or content.
  function sync() {
    if (revealInstance) {
      revealInstance.sync()
    }
  }

  function syncSlide(slide: HTMLElement) {
    if (revealInstance) {
      revealInstance.syncSlide(slide)
    }
  }

  function destroy() {
    if (overlayObserver) {
      overlayObserver.disconnect()
      overlayObserver = null
    }
    if (revealInstance) {
      revealInstance.destroy()
      revealInstance = null
    }
  }

  function getInstance() {
    return revealInstance
  }

  function slide(indexh: number, indexv?: number, indexf?: number) {
    if (revealInstance) {
      revealInstance.slide(indexh, indexv, indexf)
    }
  }

  function getIndices() {
    return revealInstance?.getIndices() || { h: 0, v: 0, f: 0 }
  }

  function on(event: string, callback: (event: any) => void) {
    if (revealInstance) {
      revealInstance.on(event, callback)
    }
  }

  function off(event: string, callback: (event: any) => void) {
    if (revealInstance) {
      revealInstance.off(event, callback)
    }
  }

  return {
    initialize,
    destroy,
    getInstance,
    sync,
    syncSlide,
    slide,
    getIndices,
    on,
    off,
  }
}
