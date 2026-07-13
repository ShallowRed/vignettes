import { getActorRole } from '../../utils/actor'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  return {
    user: session.user || null,
    loggedIn: !!session.user,
    role: await getActorRole(event),
  }
})
