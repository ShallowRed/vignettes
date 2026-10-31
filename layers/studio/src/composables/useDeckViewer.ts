import type { DeckViewer } from '#shared/presentations'

const NO_VIEWER: DeckViewer = { canEdit: false, signedIn: false, variants: [] }

/**
 * What the deck page and the editor offer the visitor beside the deck
 * (`/api/presentations/:slug/viewer`), read with the page, on the server too: on
 * the deck origin the view pass of the deck names the account, and the commands
 * show from the first render. One key per deck, so that the page and the
 * components read it once. A frozen bundle, prerendered, offers nothing beside
 * its deck.
 */
export function useDeckViewer(slug: string | undefined) {
  const requestFetch = useRequestFetch()
  return useAsyncData(`deck-viewer-${slug}`, () => slug && !import.meta.prerender
    ? requestFetch<DeckViewer>(`/api/presentations/${slug}/viewer`).catch(() => NO_VIEWER)
    : Promise.resolve(NO_VIEWER), { default: () => NO_VIEWER })
}
