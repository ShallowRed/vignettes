/**
 * Typed source errors so callers pick an explicit policy: a missing note may
 * degrade to the stub, but an unreadable registry should fail closed rather than
 * present an empty catalog.
 */

/** A source could not be reached (network, auth, mis-config). Fail-closed worthy. */
export class SourceUnreachableError extends Error {
  constructor(
    public readonly source: string,
    public readonly ref: string,
    public readonly cause?: unknown,
  ) {
    super(`[${source}] could not reach "${ref}": ${describeCause(cause)}`)
    this.name = 'SourceUnreachableError'
  }
}

/** A source was reached but the referenced entry does not exist. */
export class SourceNotFoundError extends Error {
  constructor(
    public readonly source: string,
    public readonly ref: string,
  ) {
    super(`[${source}] "${ref}" not found`)
    this.name = 'SourceNotFoundError'
  }
}

function describeCause(cause: unknown): string {
  if (cause == null)
    return 'unknown error'
  if (cause instanceof Error)
    return cause.message
  return String(cause)
}
