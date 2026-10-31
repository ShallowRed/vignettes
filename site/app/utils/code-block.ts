import type { VNode } from 'vue'

/** The raw text of the first code block among `nodes`: a code block renders as `ProsePre`, which receives it as `code`. */
export function codeOf(nodes: VNode[] | undefined): string | undefined {
  for (const node of nodes ?? []) {
    const code = (node.props as { code?: unknown } | null)?.code
    if (typeof code === 'string')
      return code
    if (Array.isArray(node.children)) {
      const nested = codeOf(node.children as VNode[])
      if (nested)
        return nested
    }
  }
  return undefined
}
