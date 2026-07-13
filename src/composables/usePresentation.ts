import type { PresentationData } from '~/types/presentation'
import { parserIdFor } from '#shared/deck'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { DEFAULT_METADATA } from '~/config/presentation'
import { PARSERS } from '~/utils/slide-ast'

export function usePresentation(slug: string, apiUrl?: string) {
  // Must be called in setup scope. useRequestFetch re-emits the session cookie in
  // SSR so a logged-in user can load a PROTECTED deck (else the API sees anonymous).
  // Only for the internal path: an explicit apiUrl (possibly external, e.g. a bundle)
  // uses bare $fetch to avoid leaking the cookie to a third party.
  const requestFetch = useRequestFetch()
  const { data, error, status, refresh } = useAsyncData(
    `presentation-${slug}`,
    async (): Promise<PresentationData> => {
      const response = apiUrl
        ? await $fetch<{ content: string, editUrl?: string }>(apiUrl)
        : await requestFetch<{ content: string, editUrl?: string }>(`/api/presentations/${slug}`)

      const ast = await parseMarkdown(response.content)

      const metadata = {
        ...DEFAULT_METADATA,
        ...(ast.data || {}),
      }

      // The deck's `parser` mode selects heading vs separator via the shared port.
      const parser = PARSERS[parserIdFor(metadata)]
      const slides = await parser.parse(response.content, metadata)

      return { slides, metadata, editUrl: response.editUrl }
    },
    {
      default: () => ({
        slides: [],
        metadata: { ...DEFAULT_METADATA },
        editUrl: undefined,
      }),
    },
  )

  return {
    presentationData: data,
    error,
    status,
    refresh,
  }
}
