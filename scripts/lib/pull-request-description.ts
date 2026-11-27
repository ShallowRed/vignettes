/** The sections of the description of a pull request, in their order. */
export const SECTIONS = ['Context', 'Description', 'Changes', 'Testing', 'Follow-up'] as const

export type Section = typeof SECTIONS[number]

export interface Template {
  /** The types of Conventional Commits whose pull requests follow the template. */
  types: readonly string[]
  /** The sections the template requires; it accepts every other section of `SECTIONS`. */
  required: readonly Section[]
}

/** The templates of `.github/PULL_REQUEST_TEMPLATE/`, by the name of their file. */
export const TEMPLATES = {
  feature: { types: ['feat', 'refactor', 'perf'], required: ['Description', 'Changes', 'Testing'] },
  fix: { types: ['fix'], required: ['Context', 'Description', 'Testing'] },
  maintenance: { types: ['build', 'chore', 'ci', 'docs', 'revert', 'style', 'test'], required: ['Description', 'Testing'] },
} as const satisfies Record<string, Template>

export type TemplateName = keyof typeof TEMPLATES

export function templatePath(template: TemplateName): string {
  return `.github/PULL_REQUEST_TEMPLATE/${template}.md`
}

/** The template for a title written as `type(scope): subject`. */
export function templateOf(title: string): TemplateName | undefined {
  const type = /^([a-z]+)(?:\([^)]+\))?!?: \S/.exec(title)?.[1]
  return (Object.keys(TEMPLATES) as TemplateName[]).find(name => (TEMPLATES[name].types as readonly string[]).includes(type ?? ''))
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

/** What separates the description of a pull request from the template for the type of its title; empty when it follows the template. */
export function descriptionIssues(title: string, body: string): string[] {
  const template = templateOf(title)
  if (!template)
    return [`The title “${title}” does not start with a type of Conventional Commits: ${Object.values(TEMPLATES).flatMap(({ types }) => types).join(', ')}.`]
  const issues: string[] = []
  const { before, sections } = blocks(body)
  if (content(before))
    issues.push('Text stands before the first heading: move it into a section.')

  const names: Section[] = []
  for (const section of sections) {
    const name = SECTIONS.find(known => section.heading === `## ${known}`)
    if (!name)
      issues.push(`“${section.heading}” is not a heading of the templates: ${SECTIONS.map(known => `## ${known}`).join(', ')}.`)
    else if (names.includes(name))
      issues.push(`“## ${name}” appears twice.`)
    else if (names.some(earlier => SECTIONS.indexOf(earlier) > SECTIONS.indexOf(name)))
      issues.push(`“## ${name}” comes too late: the order is ${SECTIONS.join(', ')}.`)
    else if (!content(section))
      issues.push(`“## ${name}” is empty: fill it or remove it.`)
    if (name)
      names.push(name)
  }
  for (const name of TEMPLATES[template].required.filter(required => !names.includes(required)))
    issues.push(`“## ${name}” is missing: a pull request of this type follows ${templatePath(template)}.`)

  const section = (name: Section) => sections.find(candidate => candidate.heading === `## ${name}`)
  const description = section('Description')
  if (description && /\n\s*\n|^\s*(?:[-*+]|\d+\.)\s/m.test(content(description)))
    issues.push('“## Description” holds one sentence, in one paragraph: move the list or the other paragraphs to “## Changes”.')
  const changes = section('Changes')
  if (changes && content(changes).split('\n').some(line => line.trim() && !/^(?:- |\s{2,}\S)/.test(line)))
    issues.push('“## Changes” is a list: start each element with “- ”.')
  if (sections.some(candidate => prose(candidate).includes('=>')))
    issues.push('Replace “=>” with a full sentence: a subject, a verb and what the change does.')
  return issues
}
