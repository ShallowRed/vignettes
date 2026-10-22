// The members of the object Reveal passes to a plugin's `init` that the plugin uses;
// `scroll` is the scroll view controller.
interface RevealDeck {
  getConfig: () => { hash?: boolean, history?: boolean }
  configure: (options: Record<string, unknown>) => void
  on: (type: string, listener: () => void) => void
  getViewportElement: () => HTMLElement
  getSlidesElement: () => HTMLElement
  scroll: {
    activate: () => void
    isActive: () => boolean
    scrollToSlide: (slide: HTMLElement) => void
  }
}

/**
 * Reveal plugin that opens a link to a slide on that slide in the scroll view, the
 * view Reveal switches to below `scrollActivationWidth` (435px by default).
 *
 * Reveal switches to the scroll view while it lays the deck out, before it reads
 * the URL hash, and writes the first slide's hash over the link. The plugin turns
 * the URL writing off until Reveal is ready.
 *
 * Reveal scrolls to a slide at its share of the scroll triggers, which lies above
 * the slide's page by up to a viewport height, and scroll snapping settles on the
 * previous page (hakimel/reveal.js#3815). The plugin scrolls to the page itself.
 *
 * The frozen bundle inlines the source of this function, so its body refers to
 * nothing outside it.
 */
export function scrollViewLinks() {
  return {
    id: 'scroll-view-links',
    init(deck: RevealDeck) {
      const { hash, history } = deck.getConfig()
      deck.configure({ hash: false, history: false })
      deck.on('ready', () => deck.configure({ hash, history }))

      const scrollView = deck.scroll
      const scrollToSlide = scrollView.scrollToSlide.bind(scrollView)
      scrollView.scrollToSlide = (slide) => {
        const page = slide.closest('.scroll-page')
        if (!scrollView.isActive() || !page)
          return scrollToSlide(slide)
        const viewport = deck.getViewportElement()
        viewport.scrollTop += page.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      }
    },
  }
}

/**
 * Reveal plugin that loads every frame of the deck in the scroll view. The
 * frames wait in Reveal's lazy `data-src` until their slide is shown, and the
 * scroll view of Reveal 5.2.1 loads and unloads a page on alternate scroll
 * events: a frame would reload on each scroll, or stay blank. A frame with
 * `src` and without Reveal's `data-src` and `data-lazy-loaded` stays loaded.
 *
 * The frozen bundle inlines the source of this function, so its body refers to
 * nothing outside it.
 */
export function scrollViewFrames() {
  return {
    id: 'scroll-view-frames',
    init(deck: RevealDeck) {
      const scrollView = deck.scroll
      const activate = scrollView.activate.bind(scrollView)
      scrollView.activate = () => {
        activate()
        deck.getSlidesElement().querySelectorAll('iframe[data-src], iframe[data-lazy-loaded]').forEach((frame) => {
          const src = frame.getAttribute('data-src')
          if (src && frame.getAttribute('src') !== src)
            frame.setAttribute('src', src)
          frame.removeAttribute('data-src')
          frame.removeAttribute('data-lazy-loaded')
        })
      }
    },
  }
}
