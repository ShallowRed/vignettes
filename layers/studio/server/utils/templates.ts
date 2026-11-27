import type { CreationChoices } from '@vignettes/core/deck'
import { creationDraft } from '@vignettes/core/deck'

/**
 * The starting points of a new deck: the Markdown files of
 * `layers/studio/templates/`, mounted as the Nitro server assets
 * `assets:templates` in the layer's Nuxt config
 * (https://nitro.build/guide/assets#server-assets). A template is listed and
 * loaded by its file name without `.md`.
 */
const STORAGE = 'assets:templates'
const EXTENSION = '.md'
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/

/** The template a deck starts from when the request names none. */
export const DEFAULT_TEMPLATE = 'blank'

/** The ids of the templates: the default one first, then the others in name order. */
export async function listTemplates(): Promise<string[]> {
  const ids = (await useStorage(STORAGE).getKeys())
    .filter(key => key.endsWith(EXTENSION))
    .map(key => key.slice(0, -EXTENSION.length))
    .filter(id => TEMPLATE_ID.test(id))
  return ids.sort((a, b) => Number(b === DEFAULT_TEMPLATE) - Number(a === DEFAULT_TEMPLATE) || a.localeCompare(b))
}

/** The Markdown of a template, null when there is no template with this id. */
export async function loadTemplate(id: string): Promise<string | null> {
  if (!TEMPLATE_ID.test(id))
    return null
  const text = await useStorage(STORAGE).getItem(`${id}${EXTENSION}`)
  return typeof text === 'string' ? text : null
}

/**
 * A new deck's first draft from a template: `creationDraft`, and the first
 * level-1 heading, which opens the title slide, takes the title.
 */
export function deckFromTemplate(template: string, choices: CreationChoices & { title: string }): string {
  return creationDraft(template, choices).replace(/^# .*$/m, () => `# ${choices.title}`)
}
