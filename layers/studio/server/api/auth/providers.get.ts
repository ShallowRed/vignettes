/**
 * Which OAuth providers this deployment can actually serve. The login page reads
 * this to hide the buttons whose credentials are absent — a visible button that
 * 500s ("missing client id") is worse than no button. GitHub is the historical
 * default and always offered.
 */
export default defineEventHandler((event) => {
  const oauth = useRuntimeConfig(event).oauth as
    { google?: { clientId?: string, clientSecret?: string } } | undefined
  return {
    github: true,
    google: Boolean(oauth?.google?.clientId && oauth?.google?.clientSecret),
  }
})
