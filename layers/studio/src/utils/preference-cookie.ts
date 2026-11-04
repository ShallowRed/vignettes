/** The options of a cookie that keeps a choice of the visitor for a year, which the server reads to render the page with it. */
export const PREFERENCE_COOKIE = { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' } as const
