/** The `key=value` entries of an attribute, separated by `|`; an entry without `=` is skipped. */
export function pairs(source?: string): { key: string, value: string }[] {
  return (source ?? '').split('|').flatMap((entry) => {
    const separator = entry.indexOf('=')
    if (separator < 0)
      return []
    return [{ key: entry.slice(0, separator).trim(), value: entry.slice(separator + 1).trim() }]
  })
}
