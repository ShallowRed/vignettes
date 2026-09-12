export type TextTransformer = (text: string) => string

export interface DomTextTransformerOptions {
  transform: TextTransformer
  /** @default ['script', 'style', 'code', 'pre', 'textarea', 'input'] */
  skipElements?: string[]
}

const DEFAULT_SKIP_ELEMENTS = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  'input',
]

export class DomTextTransformer {
  private readonly transform: TextTransformer
  private readonly skipElements: Set<string>

  constructor(options: DomTextTransformerOptions) {
    this.transform = options.transform
    this.skipElements = new Set(
      (options.skipElements ?? DEFAULT_SKIP_ELEMENTS).map(tag => tag.toLowerCase()),
    )
  }

  processNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      const transformed = this.transform(node.textContent)
      if (transformed !== node.textContent) {
        node.textContent = transformed
      }
    }
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = (node as Element).tagName.toLowerCase()

      if (this.skipElements.has(tagName)) {
        return
      }

      node.childNodes.forEach(child => this.processNode(child))
    }
  }

  /** Returns an already-started observer that transforms newly added/changed content. */
  createObserver(element: HTMLElement): MutationObserver {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          this.processNode(node)
        })

        if (mutation.type === 'characterData' && mutation.target.textContent) {
          const transformed = this.transform(mutation.target.textContent)
          if (transformed !== mutation.target.textContent) {
            mutation.target.textContent = transformed
          }
        }
      })
    })

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return observer
  }
}

export function createDomTextTransformer(
  options: DomTextTransformerOptions,
): DomTextTransformer {
  return new DomTextTransformer(options)
}
