import { docsAddress } from '../config/editor-reference'

/** The address of a documentation section under the help address of the instance (see `docsAddress`). */
export function useDocsAddress() {
  const { helpUrl } = useRuntimeConfig().public
  return (docs?: string) => docsAddress(docs, helpUrl)
}
