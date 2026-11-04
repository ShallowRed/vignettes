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

// The values of `Node.ELEMENT_NODE` and `Node.TEXT_NODE`.
const ELEMENT_NODE = 1
const TEXT_NODE = 3

// An element the author types in, and a text inside it, keep the characters typed.
function isEditable(node: Node): boolean {
  const element = node.nodeType === ELEMENT_NODE ? node as HTMLElement : node.parentElement
  return element?.isContentEditable === true
}

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
    if (isEditable(node))
      return
    if (node.nodeType === TEXT_NODE && node.textContent) {
      const transformed = this.transform(node.textContent)
      if (transformed !== node.textContent) {
        node.textContent = transformed
      }
    }
    else if (node.nodeType === ELEMENT_NODE) {
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
      mutations.forEach(mutation => this.processMutation(mutation))
    })

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return observer
  }

  /** Transforms the nodes a mutation added and the text it changed. */
  processMutation(mutation: Pick<MutationRecord, 'type' | 'target' | 'addedNodes'>): void {
    mutation.addedNodes.forEach((node) => {
      this.processNode(node)
    })

    if (mutation.type === 'characterData' && mutation.target.textContent && !isEditable(mutation.target)) {
      const transformed = this.transform(mutation.target.textContent)
      if (transformed !== mutation.target.textContent) {
        mutation.target.textContent = transformed
      }
    }
  }
}

export function createDomTextTransformer(
  options: DomTextTransformerOptions,
): DomTextTransformer {
  return new DomTextTransformer(options)
}
