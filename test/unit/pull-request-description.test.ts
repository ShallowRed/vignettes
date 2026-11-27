import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { descriptionIssues, SECTIONS, templateOf, templatePath, TEMPLATES } from '../../scripts/lib/pull-request-description.ts'

const ROOT = join(import.meta.dirname, '../..')

const FEATURE = [
  '## Description',
  '',
  'Adds the `check` command, which checks a deck file.',
  '',
  '## Changes',
  '',
  '- `check` writes one line per problem,',
  '  then a count.',
  '- The command exits with code 1 when a file has an error.',
  '',
  '## Testing',
  '',
  '`mise run check`.',
].join('\n')

const without = (body: string, heading: string) => body.replace(new RegExp(`## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`), '')

describe('the template of a pull request (scripts/lib/pull-request-description.ts)', () => {
  it.each([
    ['feat(cli): add the check command', 'feature'],
    ['refactor(core)!: split the reader', 'feature'],
    ['fix: keep the selection', 'fix'],
    ['chore(deps): bump vitest from 4.1.9 to 4.1.11', 'maintenance'],
    ['docs(decisions): add a registry', 'maintenance'],
  ])('reads the template for “%s” in its type: %s', (title, template) => {
    expect(templateOf(title)).toBe(template)
  })

  it.each(['Add the check command', 'feature(cli): add the check command', 'feat(cli):add the check command'])('refuses the title “%s”', (title) => {
    expect(templateOf(title)).toBeUndefined()
    expect(descriptionIssues(title, FEATURE)).toEqual([expect.stringContaining('does not start with a type of Conventional Commits')])
  })

  it('lists in CONTRIBUTING.md the types and the required sections of each template, and the order of the sections', () => {
    const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
    const code = (names: readonly string[]) => names.map(name => `\`${name}\``)
    for (const [name, template] of Object.entries(TEMPLATES)) {
      const types = code(template.types)
      const listed = types.length > 1 ? `${types.slice(0, -1).join(', ')} and ${types.at(-1)}` : types[0]
      expect(contributing.split('\n'), name).toContainEqual(expect.stringMatching(new RegExp(`^- \`${name}\\.md\` for ${listed}: ${code(template.required).join(', ')}[;.]$`)))
    }
    expect(contributing).toContain(`The sections follow the order ${code(SECTIONS).join(', ')}.`)
  })

  it('keeps one file per template, with the required sections of the template in their order', () => {
    expect(readdirSync(join(ROOT, '.github/PULL_REQUEST_TEMPLATE')).sort()).toEqual(Object.keys(TEMPLATES).map(name => `${name}.md`))
    for (const [name, template] of Object.entries(TEMPLATES)) {
      const text = readFileSync(join(ROOT, templatePath(name as keyof typeof TEMPLATES)), 'utf8')
      expect(text.match(/^## .+$/gm), name).toEqual(template.required.map(section => `## ${section}`))
      expect(descriptionIssues(`${template.types[0]}: subject`, text), name).toEqual(template.required.map(section => `“## ${section}” is empty: fill it or remove it.`))
    }
  })
})

describe('the description of a pull request (scripts/lib/pull-request-description.ts)', () => {
  it('accepts a description that follows the template for its title, with the optional sections', () => {
    expect(descriptionIssues('feat(cli): add the check command', FEATURE)).toEqual([])
    expect(descriptionIssues('feat(cli): add the check command', `## Context\n\nThe studio alone checked a deck.\n\n${FEATURE}\n\n## Follow-up\n\nThe \`push\` command.`)).toEqual([])
    expect(descriptionIssues('fix(cli): read the last line', `## Context\n\n\`check\` skipped the last line.\n\n${without(FEATURE, 'Changes')}`)).toEqual([])
    expect(descriptionIssues('chore(deps): update vitest', without(FEATURE, 'Changes').replace(/\n/g, '\r\n'))).toEqual([])
  })

  it.each([
    ['feat: subject', 'Changes'],
    ['feat: subject', 'Testing'],
    ['fix: subject', 'Context'],
    ['docs: subject', 'Description'],
  ])('requires for “%s” the section %s', (title, section) => {
    expect(descriptionIssues(title, without(`## Context\n\nA defect.\n\n${FEATURE}`, section))).toEqual([expect.stringMatching(new RegExp(`“## ${section}” is missing: a pull request of this type follows \\.github/PULL_REQUEST_TEMPLATE/\\w+\\.md`))])
  })

  it('refuses a heading outside the templates, a repeated one and one out of order', () => {
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n## Notes\n\nA text.`)).toEqual([expect.stringContaining('“## Notes” is not a heading of the templates')])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n### Testing\n\nA text.`)).toEqual([expect.stringContaining('“### Testing” is not a heading')])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n## Testing\n\nA text.`)).toEqual(['“## Testing” appears twice.'])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n## Context\n\nA text.`)).toEqual([`“## Context” comes too late: the order is ${SECTIONS.join(', ')}.`])
  })

  it('refuses a text before the first heading and a section left empty or with its comment alone', () => {
    expect(descriptionIssues('feat: subject', `A summary.\n\n${FEATURE}`)).toEqual([expect.stringContaining('before the first heading')])
    expect(descriptionIssues('feat: subject', `<!-- The template. -->\n\n${FEATURE}\n\n## Follow-up\n\n<!-- What remains. -->`)).toEqual(['“## Follow-up” is empty: fill it or remove it.'])
  })

  it('keeps the description to one paragraph and the modifications to a list', () => {
    expect(descriptionIssues('feat: subject', FEATURE.replace('which checks', '\n\nIt checks'))).toEqual([expect.stringContaining('“## Description” holds one sentence')])
    expect(descriptionIssues('feat: subject', FEATURE.replace('Adds the', '- Adds the'))).toEqual([expect.stringContaining('“## Description” holds one sentence')])
    expect(descriptionIssues('feat: subject', FEATURE.replace('- The command', 'The command'))).toEqual([expect.stringContaining('“## Changes” is a list')])
  })

  it('refuses “=>” in the text, and reads a heading or “=>” in code as code', () => {
    expect(descriptionIssues('feat: subject', FEATURE.replace('`check` writes', '`check` => writes'))).toEqual([expect.stringContaining('Replace “=>”')])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n\`const run = () => 1\`\n\n\`\`\`md\n## Title of a deck\na => b\n\`\`\``)).toEqual([])
  })
})
