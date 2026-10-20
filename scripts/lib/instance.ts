import process from 'node:process'
import { failure } from './remote-republish.ts'

/** A deployed instance: its address and the content token it was started with. */
export interface Instance {
  url: string
  token: string
}

/**
 * The instance a content task talks to: `VIGNETTES_REMOTE`, or with `--staging`
 * `VIGNETTES_STAGING_REMOTE`, set in `mise.local.toml`. The content token comes
 * from Infisical through `scripts/with-secrets.sh`.
 */
export function instanceFromEnv(staging: boolean, env: Record<string, string | undefined> = process.env): Instance {
  const name = staging ? 'VIGNETTES_STAGING_REMOTE' : 'VIGNETTES_REMOTE'
  const url = env[name]?.trim()
  const token = env.NUXT_CONTENT_TOKEN?.trim()
  if (!url) {
    console.error(`${name} absent : l'adresse de l'instance (voir mise.local.toml).`)
    process.exit(2)
  }
  if (!token) {
    console.error('NUXT_CONTENT_TOKEN absent : le jeton de contenu de l\'instance est requis (infisical run --env=… -- …).')
    process.exit(2)
  }
  return { url: url.replace(/\/$/, ''), token }
}

/** Calls a route of the instance with the content token; an error answer throws. */
export async function callInstance<T>(instance: Instance, path: string, body?: unknown): Promise<T> {
  const method = body === undefined ? 'GET' : 'POST'
  const res = await fetch(`${instance.url}${path}`, {
    method,
    headers: { authorization: `Bearer ${instance.token}`, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((error) => {
    throw new Error(`${instance.url} injoignable : ${error.cause?.message ?? error.message}`)
  })
  if (!res.ok)
    throw await failure(res, `${method} ${path}`)
  return await res.json() as T
}
