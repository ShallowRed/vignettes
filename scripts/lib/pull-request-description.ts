/** The sections of the description of a pull request, in their order. */
export const SECTIONS = ['Contexte', 'Description', 'Modifications', 'Vérification', 'Suites'] as const

export type Section = typeof SECTIONS[number]

export interface Model {
  /** The types of Conventional Commits whose pull requests follow the model. */
  types: readonly string[]
  /** The sections the model requires; it accepts every other section of `SECTIONS`. */
  required: readonly Section[]
}

/** The models of `.github/PULL_REQUEST_TEMPLATE/`, by the name of their file. */
export const MODELS = {
  feature: { types: ['feat', 'refactor', 'perf'], required: ['Description', 'Modifications', 'Vérification'] },
  fix: { types: ['fix'], required: ['Contexte', 'Description', 'Vérification'] },
  maintenance: { types: ['build', 'chore', 'ci', 'docs', 'revert', 'style', 'test'], required: ['Description', 'Vérification'] },
} as const satisfies Record<string, Model>

export type ModelName = keyof typeof MODELS

export function templatePath(model: ModelName): string {
  return `.github/PULL_REQUEST_TEMPLATE/${model}.md`
}

/** The model of a title written as `type(scope): subject`. */
export function modelOf(title: string): ModelName | undefined {
  const type = /^([a-z]+)(?:\([^)]+\))?!?: \S/.exec(title)?.[1]
  return (Object.keys(MODELS) as ModelName[]).find(name => (MODELS[name].types as readonly string[]).includes(type ?? ''))
}

interface Block {
  heading?: string
  lines: string[]
}

/** The text before the first heading, then one block per heading; a fenced code block holds no heading. */
function blocks(body: string): { before: Block, sections: Block[] } {
  const before: Block = { lines: [] }
  const sections: Block[] = []
  let current = before
  let fence: string | undefined
  for (const line of body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (mark && (!fence || mark.startsWith(fence)))
      fence = fence ? undefined : mark
    if (!fence && /^#{1,6}\s/.test(line)) {
      current = { heading: line.trim(), lines: [] }
      sections.push(current)
    }
    else {
      current.lines.push(line)
    }
  }
  return { before, sections }
}

const content = (block: Block) => block.lines.join('\n').trim()

/** The text of a block without its code, where `=>` is a part of the code. */
const prose = (block: Block) => content(block).replace(/(`{3,}|~{3,})[\s\S]*?\1/g, '').replace(/`[^`\n]*`/g, '')

/** What separates the description of a pull request from the model that the type of its title names; empty when it follows the model. */
export function descriptionIssues(title: string, body: string): string[] {
  const model = modelOf(title)
  if (!model)
    return [`The title “${title}” does not start with a type of Conventional Commits: ${Object.values(MODELS).flatMap(({ types }) => types).join(', ')}.`]
  const issues: string[] = []
  const { before, sections } = blocks(body)
  if (content(before))
    issues.push('Text stands before the first heading: move it into a section.')

  const names: Section[] = []
  for (const section of sections) {
    const name = SECTIONS.find(known => section.heading === `## ${known}`)
    if (!name)
      issues.push(`“${section.heading}” is not a heading of the models: ${SECTIONS.map(known => `## ${known}`).join(', ')}.`)
    else if (names.includes(name))
      issues.push(`“## ${name}” appears twice.`)
    else if (names.some(earlier => SECTIONS.indexOf(earlier) > SECTIONS.indexOf(name)))
      issues.push(`“## ${name}” comes too late: the order is ${SECTIONS.join(', ')}.`)
    else if (!content(section))
      issues.push(`“## ${name}” is empty: fill it or remove it.`)
    if (name)
      names.push(name)
  }
  for (const name of MODELS[model].required.filter(required => !names.includes(required)))
    issues.push(`“## ${name}” is missing: a pull request of this type follows ${templatePath(model)}.`)

  const section = (name: Section) => sections.find(candidate => candidate.heading === `## ${name}`)
  const description = section('Description')
  if (description && /\n\s*\n|^\s*(?:[-*+]|\d+\.)\s/m.test(content(description)))
    issues.push('“## Description” holds one sentence, in one paragraph: move the list or the other paragraphs to “## Modifications”.')
  const changes = section('Modifications')
  if (changes && content(changes).split('\n').some(line => line.trim() && !/^(?:- |\s{2,}\S)/.test(line)))
    issues.push('“## Modifications” is a list: start each element with “- ”.')
  if (sections.some(candidate => prose(candidate).includes('=>')))
    issues.push('Replace “=>” with a full sentence: a subject, a verb and what the change does.')
  return issues
}
