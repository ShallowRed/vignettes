import type { RequestSide } from '#shared/origins'

/**
 * The side of the origin the page renders on, which the server decides
 * (`server/middleware/00.origins.ts`) and the payload carries to the browser.
 */
export function useOriginSide() {
  return useState<RequestSide>('origin-side', () => (import.meta.server ? useRequestEvent()?.context.originSide : undefined) ?? 'single')
}
