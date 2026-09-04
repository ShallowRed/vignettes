import { assertPrivileged } from '../../utils/access'

import { hashAccessPassword } from '../../utils/password'

export default defineEventHandler(async (event) => {
  await assertPrivileged(event)

  const body = await readBody(event)
  const password = body?.password

  if (!password || typeof password !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password is required',
    })
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
    })
  }

  const hash = await hashAccessPassword(password)

  return {
    hash,
    usage: `Add this to your presentation frontmatter:\n---\naccessPassword: "${hash}"\n---`,
  }
})
