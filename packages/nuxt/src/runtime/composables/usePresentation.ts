import type { ParseOptions } from '@vignettes/core/deck'
import type { PresentationData } from '../types/presentation.ts'
import { useAsyncData, useRequestFetch } from '#imports'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { frontmatterSource, parserIdFor, splitFrontmatter } from '@vignettes/core/deck'
import { themedReveal } from '@vignettes/core/theme'
import { defaultMetadata } from '../config/presentation.ts'
import { PARSERS } from '../utils/slide-ast.ts'

/**
 * Parse raw deck markdown into `PresentationData`: the single client-side parse
 * path, shared by `usePresentation` (server-fetched) and the integrated editor
 * (live, as-you-type). One definition means the editor preview is exactly what
 * the deck routes render.
 */
export async function buildPresentationData(
  raw: string,
  options?: ParseOptions,
): Promise<PresentationData> {
  // MDC reads the metadata from the frontmatter alone, and takes the title from
  // the first heading of the body when the frontmatter names none.
  const ast = await parseMarkdown(splitFrontmatter(raw).data.title ? frontmatterSource(raw) : raw)
  const metadata = {
    ...defaultMetadata(),
    ...(ast.data || {}),
  }
  metadata.reveal = themedReveal(metadata)
  // The deck's `syntax.split` selects heading vs separator via the shared port.
  const parser = PARSERS[parserIdFor(metadata)]
  // `?? []` keeps `slides` an array even if a parser degrades, so downstream
  // `.slides.length` guards can never read `.length` of undefined.
  const slides = (await parser.parse(raw, metadata, options)) ?? []
  return { slides, metadata }
}

export function usePresentation(slug: string, apiUrl?: string, options: { draft?: boolean } = {}) {
  // `draft`: the working draft instead of the published version (editors only;
  // the API refuses it otherwise).
  const draft = options.draft === true
  // Must be called in setup scope. useRequestFetch re-emits the session cookie in
  // SSR so a logged-in user can load a PROTECTED deck (else the API sees anonymous).
  // Only for a path of this site: an external apiUrl uses bare $fetch to avoid
  // leaking the cookie to a third party.
  const requestFetch = useRequestFetch()
  const { data, error, status, refresh } = useAsyncData(
    `presentation-${slug}${draft ? '-draft' : ''}`,
    async (): Promise<PresentationData> => {
      const response = apiUrl
        ? await (apiUrl.startsWith('/') && !apiUrl.startsWith('//') ? requestFetch : $fetch)<{ content: string }>(apiUrl)
        : await requestFetch<{ content: string }>(`/api/presentations/${slug}`, draft ? { query: { draft: '' } } : {})

      return buildPresentationData(response.content)
    },
    {
      default: () => ({
        slides: [],
        metadata: defaultMetadata(),
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
