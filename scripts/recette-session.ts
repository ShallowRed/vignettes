/**
 * Opens the staging instance as a persona of the acceptance kit and writes the
 * session to a Playwright storage state, for a script that checks a version in
 * a browser (`browser.newContext({ storageState })`).
 *
 *   node scripts/recette-session.ts <persona> [<file>]
 *
 * The persona is a key of `shared/recette/personas.ts` whose role is below the
 * owner (editor, viewer…). `RECETTE_TOKEN` is a personal token of an
 * owner of the staging instance, with the read and write scope, that
 * `scripts/with-secrets.sh` takes from Infisical; `VIGNETTES_STAGING_REMOTE`
 * names the instance (`mise.local.toml`). The file holds a session: it is
 * written to the temporary directory by default, readable by its owner alone.
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const [persona, file = join(tmpdir(), `vignettes-recette-${persona}.json`)] = process.argv.slice(2)
const url = process.env.VIGNETTES_STAGING_REMOTE?.trim().replace(/\/$/, '')
const token = process.env.RECETTE_TOKEN?.trim()
if (!persona || !url || !token) {
  console.error('Usage : node scripts/recette-session.ts <persona> [<fichier>], avec VIGNETTES_STAGING_REMOTE et RECETTE_TOKEN.')
  process.exit(2)
}

const res = await fetch(`${url}/auth/recette`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ as: persona, redirect: '/' }),
})
if (res.status !== 303) {
  console.error(`POST /auth/recette : ${res.status} ${res.statusText}`)
  process.exit(1)
}

const { hostname } = new URL(url)
const cookies = res.headers.getSetCookie().map((header) => {
  const [pair = '', ...attributes] = header.split(';').map(part => part.trim())
  const at = pair.indexOf('=')
  const attribute = (name: string) => attributes.find(a => a.toLowerCase().startsWith(name))?.split('=')[1]
  const maxAge = Number(attribute('max-age'))
  return {
    name: pair.slice(0, at),
    value: pair.slice(at + 1),
    domain: hostname,
    path: attribute('path') ?? '/',
    expires: Number.isFinite(maxAge) ? Math.floor(Date.now() / 1000) + maxAge : -1,
    httpOnly: attributes.some(a => a.toLowerCase() === 'httponly'),
    secure: attributes.some(a => a.toLowerCase() === 'secure'),
    sameSite: 'Lax' as const,
  }
})
writeFileSync(file, JSON.stringify({ cookies, origins: [] }), { mode: 0o600 })
console.log(file)
