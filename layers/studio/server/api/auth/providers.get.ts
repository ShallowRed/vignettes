/** The OAuth providers this deployment holds credentials for; the login page shows their buttons only. */
export default defineEventHandler((event) => {
  const oauth = useRuntimeConfig(event).oauth as
    { github?: { clientId?: string, clientSecret?: string }, google?: { clientId?: string, clientSecret?: string } } | undefined
  return {
    github: Boolean(oauth?.github?.clientId && oauth?.github?.clientSecret),
    google: Boolean(oauth?.google?.clientId && oauth?.google?.clientSecret),
  }
})
