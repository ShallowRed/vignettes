interface RequestError {
  statusMessage?: string
  data?: { statusMessage?: string, message?: string }
}

/**
 * The message the server gave a failed request. Over HTTP/2 a response carries
 * no status text, so the error's own `statusMessage` is empty: the JSON body
 * the server sends with every error is read first.
 */
export function requestErrorMessage(error: unknown, fallback: string): string {
  const e = error as RequestError | null | undefined
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || fallback
}
