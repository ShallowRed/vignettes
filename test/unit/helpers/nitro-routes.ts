import { readFileSync } from 'node:fs'

/**
 * The routes of the server, including its modules', as `METHOD /pattern`, read
 * in the types `nuxt prepare` writes at install. A route answered by every
 * method is read as GET and POST.
 */
export function nitroRoutes(): string[] {
  const types = readFileSync(new URL('../../../.nuxt/types/nitro-routes.d.ts', import.meta.url), 'utf8')
  return [...types.matchAll(/\n {4}'([^']+)': \{\n((?: {6}'[a-z]+'.*\n)+)/g)].flatMap(([, route, block]) =>
    [...block!.matchAll(/^ {6}'([a-z]+)'/gm)]
      .flatMap(([, method]) => method === 'default' ? ['get', 'post'] : [method!])
      .map(method => `${method.toUpperCase()} ${route}`))
}

/** A path the pattern of a route or a page answers. */
export function samplePath(pattern: string): string {
  return pattern.replace(/\*\*(?::\w+)?|\[\.\.\.\w+\]/g, 'a/b').replace(/:\w+|\[\w+\]/g, 'x')
}
