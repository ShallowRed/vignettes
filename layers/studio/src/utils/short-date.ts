/** A date as the catalog cards write it: day and short month, and the year when it is not the current one. */
export function shortDate(date: Date | string, locale: string): string {
  const value = new Date(date)
  const sameYear = value.getFullYear() === new Date().getFullYear()
  return value.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
