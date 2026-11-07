import { listDeckAssets } from './deck-assets'

const EXTENSION = '.svg'

/**
 * The pictograms a deck can name, by their path under `/pictograms` without
 * the extension (`digital/coding`): the application's own, mounted as the Nitro
 * server assets `assets:pictograms` in the root Nuxt config
 * (https://nitro.build/guide/assets#server-assets), and those of the content space.
 */
export async function listPictograms(): Promise<string[]> {
  const own = (await useStorage('assets:pictograms').getKeys()).map(key => key.replaceAll(':', '/'))
  const names = [...own, ...await listDeckAssets('pictograms')]
    .filter(path => path.endsWith(EXTENSION))
    .map(path => path.slice(0, -EXTENSION.length))
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}
