import type { DeckMessages } from '@vignettes/core/render'
import type { RevealApi } from 'reveal.js'
import type { Ref } from 'vue'
import type { RevealConfig } from '../types/presentation.ts'
import { isDeckUrl } from '@vignettes/core/deck'
import { deckMessages, EMBED_REFERRER_POLICY, embedSandbox, localizedNotes, mergeRevealConfig, scrollViewFrames, scrollViewLinks } from '@vignettes/core/render'

export function useReveal(
  container: Ref<HTMLElement | null>,
  config: Partial<RevealConfig> = {},
  messages: DeckMessages = deckMessages(),
) {
  let revealInstance: RevealApi | null = null
  let overlayObserver: MutationObserver | null = null
  let fragmentObserver: MutationObserver | null = null

  // Reveal's preview overlay creates its own iframe that escapes the sandbox we
  // put on inline embeds; without this a link clicked inside the lightbox could
  // navigate the whole window away. Apply the sandbox of inline embeds and
  // reload under the policy.
  function sandboxOverlayIframes() {
    const root = container.value
    if (!root)
      return
    const iframes = root.querySelectorAll<HTMLIFrameElement>(
      '.r-overlay iframe:not([data-embed-sandboxed])',
    )
    iframes.forEach((iframe) => {
      const src = iframe.getAttribute('src') ?? ''
      iframe.setAttribute('sandbox', embedSandbox(src, window.location.origin))
      iframe.setAttribute('referrerpolicy', EMBED_REFERRER_POLICY)
      iframe.setAttribute('data-embed-sandboxed', '')
      // Re-trigger the load so the sandbox policy applies to the document.
      if (src && isDeckUrl(src))
        iframe.setAttribute('src', src)
      else
        iframe.removeAttribute('src')
    })
  }

  function observeOverlays() {
    if (typeof window === 'undefined' || !container.value)
      return
    overlayObserver = new MutationObserver(() => sandboxOverlayIframes())
    overlayObserver.observe(container.value, { childList: true, subtree: true })
  }

  // With `fragments: false`, Reveal marks the fragments visible once, when it is
  // configured. Components that lay out after mount (Diagram, JsonTour, Mermaid)
  // add their `fragment` class later, and a Vue re-render resets the class list:
  // those fragments would stay hidden. Mark them visible whenever they appear.
  function showLateFragments() {
    if (revealInstance?.getConfig().fragments !== false)
      return
    revealInstance.getSlidesElement()
      ?.querySelectorAll('.fragment:not(.visible)')
      .forEach((element: Element) => element.classList.add('visible'))
  }

  function observeFragments() {
    const slides = revealInstance?.getSlidesElement()
    if (!slides)
      return
    fragmentObserver = new MutationObserver(showLateFragments)
    fragmentObserver.observe(slides, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    showLateFragments()
  }

  async function initialize() {
    if (!container.value)
      return

    // Dynamic import to avoid SSR issues.
    const { default: Reveal } = await import('reveal.js')
    // Speaker view (key S): reads each slide's `aside.notes`, in the language of the deck.
    const { default: RevealNotes } = await import('reveal.js/plugin/notes/notes.esm.js')

    // The import above yields to the event loop; a fast route change can unmount
    // the deck in that gap, nulling `container.value`. Constructing Reveal then
    // makes it fall back to `document.querySelector('.reveal')` — gone too — which
    // logs "Unable to find presentation root" and crashes reading `.slides`.
    if (!container.value)
      return

    const mergedConfig = mergeRevealConfig(config)

    revealInstance = new Reveal(container.value, { ...mergedConfig, plugins: [localizedNotes(RevealNotes(), messages), scrollViewLinks, scrollViewFrames] })
    await revealInstance.initialize()

    // Sync to pick up Vue-rendered content (lightbox, previews, fragments won't
    // work otherwise since it renders after mount).
    revealInstance.sync()

    observeOverlays()
    observeFragments()

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
    if (fragmentObserver) {
      fragmentObserver.disconnect()
      fragmentObserver = null
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
