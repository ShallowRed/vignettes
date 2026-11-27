import { splitFrontmatter, stringifyDocument } from './frontmatter.ts'

export interface CreationChoices {
  title?: string
  theme?: string
  project?: string
}

/** The text with its frontmatter `project` key naming this folder; no folder removes the key. */
export function inFolder(raw: string, project?: string): string {
  const { data, body } = splitFrontmatter(raw)
  const { project: _project, ...kept } = data
  return stringifyDocument({ ...kept, ...(project ? { project } : {}) }, body.trimStart())
}

/**
 * The first draft of a new deck, from a template or an imported file, that
 * `POST /api/presentations` stores: the frontmatter takes the title and the
 * theme given at creation, and the folder chosen at creation (`inFolder`).
 * `status` is removed: the deck's row holds it.
 */
export function creationDraft(raw: string, choices: CreationChoices): string {
  const { data, body } = splitFrontmatter(raw)
  const { status: _status, ...kept } = data
  const frontmatter = {
    ...kept,
    ...(choices.title ? { title: choices.title } : {}),
    ...(choices.theme ? { theme: choices.theme } : {}),
  }
  return inFolder(stringifyDocument(frontmatter, body.trimStart()), choices.project)
}
