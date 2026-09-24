// The members of the object Reveal passes to a plugin's `init` that the plugin uses;
// `scroll` is the scroll view controller.
interface RevealDeck {
  getConfig: () => { hash?: boolean, history?: boolean }
  configure: (options: Record<string, unknown>) => void
  on: (type: string, listener: () => void) => void
  getViewportElement: () => HTMLElement
  scroll: {
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
