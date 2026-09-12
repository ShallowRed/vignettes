import type { PresentationData } from '../types/presentation'
import { useAsyncData, useRequestFetch } from '#imports'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { parserIdFor } from '@vignettes/core/deck'
import { DEFAULT_METADATA } from '../config/presentation'
import { PARSERS } from '../utils/slide-ast'

/**
 * Parse raw deck markdown into `PresentationData`: the single client-side parse
 * path, shared by `usePresentation` (server-fetched) and the integrated editor
 * (live, as-you-type). One definition means the editor preview is exactly what
 * the deck routes render.
 */
export async function buildPresentationData(
  raw: string,
): Promise<PresentationData> {
  const ast = await parseMarkdown(raw)
  const metadata = {
    ...DEFAULT_METADATA,
    ...(ast.data || {}),
  }
  // The deck's `parser` mode selects heading vs separator via the shared port.
  const parser = PARSERS[parserIdFor(metadata)]
  // `?? []` keeps `slides` an array even if a parser degrades, so downstream
  // `.slides.length` guards can never read `.length` of undefined.
  const slides = (await parser.parse(raw, metadata)) ?? []
  return { slides, metadata }
}

export function usePresentation(slug: string, apiUrl?: string, options: { draft?: boolean } = {}) {
  // `draft`: the working draft instead of the published version (editors only;
  // the API refuses it otherwise).
  const draft = options.draft === true
  // Must be called in setup scope. useRequestFetch re-emits the session cookie in
  // SSR so a logged-in user can load a PROTECTED deck (else the API sees anonymous).
  // Only for the internal path: an explicit apiUrl (possibly external, e.g. a bundle)
  // uses bare $fetch to avoid leaking the cookie to a third party.
  const requestFetch = useRequestFetch()
  const { data, error, status, refresh } = useAsyncData(
    `presentation-${slug}${draft ? '-draft' : ''}`,
    async (): Promise<PresentationData> => {
      const response = apiUrl
        ? await $fetch<{ content: string }>(apiUrl)
        : await requestFetch<{ content: string }>(`/api/presentations/${slug}`, draft ? { query: { draft: '' } } : {})

      return buildPresentationData(response.content)
    },
    {
      default: () => ({
        slides: [],
        metadata: { ...DEFAULT_METADATA },
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
