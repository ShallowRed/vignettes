import type { Directive } from 'vue'
import { DomTextTransformer } from '~/utils/dom-text-transformer'
import { transformerTexte } from '~/utils/french-typography'

const observers = new WeakMap<HTMLElement, MutationObserver>()

const frenchTypographyTransformer = new DomTextTransformer({
  transform: transformerTexte,
  skipElements: ['script', 'style', 'code', 'pre', 'textarea', 'input'],
})

export const vFrenchTypography: Directive<HTMLElement> = {
  // Required so the server renderer doesn't crash when prerendering the deck;
  // the transform itself runs client-side at `mounted`.
  getSSRProps() {
    return {}
  },

  mounted(element: HTMLElement) {
    frenchTypographyTransformer.processNode(element)
    // Observe for async MDC content added after mount.
    const observer = frenchTypographyTransformer.createObserver(element)
    observers.set(element, observer)
  },

  unmounted(element: HTMLElement) {
    const observer = observers.get(element)
    if (observer) {
      observer.disconnect()
      observers.delete(element)
    }
  },
}
