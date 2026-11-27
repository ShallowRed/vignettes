import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { descriptionIssues, modelOf, MODELS, SECTIONS, templatePath } from '../../scripts/lib/pull-request-description.ts'

const ROOT = join(import.meta.dirname, '../..')

const FEATURE = [
  '## Description',
  '',
  'Ajoute la commande `check`, qui contrôle un fichier de deck.',
  '',
  '## Modifications',
  '',
  '- `check` écrit une ligne par problème,',
  '  puis un décompte.',
  '- La commande sort avec le code 1 quand un fichier a une erreur.',
  '',
  '## Vérification',
  '',
  '`mise run check`.',
].join('\n')

const without = (body: string, heading: string) => body.replace(new RegExp(`## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`), '')

describe('the model of a pull request (scripts/lib/pull-request-description.ts)', () => {
  it.each([
    ['feat(cli): add the check command', 'feature'],
    ['refactor(core)!: split the reader', 'feature'],
    ['fix: keep the selection', 'fix'],
    ['chore(deps): bump vitest from 4.1.9 to 4.1.11', 'maintenance'],
    ['docs(decisions): add a registry', 'maintenance'],
  ])('reads the model of “%s” in its type: %s', (title, model) => {
    expect(modelOf(title)).toBe(model)
  })

  it.each(['Add the check command', 'feature(cli): add the check command', 'feat(cli):add the check command'])('refuses the title “%s”', (title) => {
    expect(modelOf(title)).toBeUndefined()
    expect(descriptionIssues(title, FEATURE)).toEqual([expect.stringContaining('does not start with a type of Conventional Commits')])
  })

  it('lists in CONTRIBUTING.md the types and the required sections of each model, and the order of the sections', () => {
    const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
    const code = (names: readonly string[]) => names.map(name => `\`${name}\``)
    for (const [name, model] of Object.entries(MODELS)) {
      const types = code(model.types)
      const listed = types.length > 1 ? `${types.slice(0, -1).join(', ')} and ${types.at(-1)}` : types[0]
      expect(contributing.split('\n'), name).toContainEqual(expect.stringMatching(new RegExp(`^- \`${name}\\.md\` for ${listed}: ${code(model.required).join(', ')}[;.]$`)))
    }
    expect(contributing).toContain(`The sections follow the order ${code(SECTIONS).join(', ')}.`)
  })

  it('keeps one template per model, with the required sections of the model in their order', () => {
    expect(readdirSync(join(ROOT, '.github/PULL_REQUEST_TEMPLATE')).sort()).toEqual(Object.keys(MODELS).map(name => `${name}.md`))
    for (const [name, model] of Object.entries(MODELS)) {
      const template = readFileSync(join(ROOT, templatePath(name as keyof typeof MODELS)), 'utf8')
      expect(template.match(/^## .+$/gm), name).toEqual(model.required.map(section => `## ${section}`))
      expect(descriptionIssues(`${model.types[0]}: subject`, template), name).toEqual(model.required.map(section => `“## ${section}” is empty: fill it or remove it.`))
    }
  })
})

describe('the description of a pull request (scripts/lib/pull-request-description.ts)', () => {
  it('accepts a description that follows the model of its title, with the optional sections', () => {
    expect(descriptionIssues('feat(cli): add the check command', FEATURE)).toEqual([])
    expect(descriptionIssues('feat(cli): add the check command', `## Contexte\n\nLe studio était seul à contrôler un deck.\n\n${FEATURE}\n\n## Suites\n\nLa commande \`push\`.`)).toEqual([])
    expect(descriptionIssues('fix(cli): read the last line', `## Contexte\n\n\`check\` ignorait la dernière ligne.\n\n${without(FEATURE, 'Modifications')}`)).toEqual([])
    expect(descriptionIssues('chore(deps): update vitest', without(FEATURE, 'Modifications').replace(/\n/g, '\r\n'))).toEqual([])
  })

  it.each([
    ['feat: subject', 'Modifications'],
    ['feat: subject', 'Vérification'],
    ['fix: subject', 'Contexte'],
    ['docs: subject', 'Description'],
  ])('requires for “%s” the section %s', (title, section) => {
    expect(descriptionIssues(title, without(`## Contexte\n\nUn défaut.\n\n${FEATURE}`, section))).toEqual([expect.stringMatching(new RegExp(`“## ${section}” is missing: a pull request of this type follows \\.github/PULL_REQUEST_TEMPLATE/\\w+\\.md`))])
  })

  it('refuses a heading outside the models, a repeated one and one out of order', () => {
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n## Notes\n\nUn texte.`)).toEqual([expect.stringContaining('“## Notes” is not a heading of the models')])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n### Vérification\n\nUn texte.`)).toEqual([expect.stringContaining('“### Vérification” is not a heading')])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n## Vérification\n\nUn texte.`)).toEqual(['“## Vérification” appears twice.'])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n## Contexte\n\nUn texte.`)).toEqual([`“## Contexte” comes too late: the order is ${SECTIONS.join(', ')}.`])
  })

  it('refuses a text before the first heading and a section left empty or with its comment alone', () => {
    expect(descriptionIssues('feat: subject', `Un résumé.\n\n${FEATURE}`)).toEqual([expect.stringContaining('before the first heading')])
    expect(descriptionIssues('feat: subject', `<!-- Le modèle. -->\n\n${FEATURE}\n\n## Suites\n\n<!-- Ce qui reste. -->`)).toEqual(['“## Suites” is empty: fill it or remove it.'])
  })

  it('keeps the description to one paragraph and the modifications to a list', () => {
    expect(descriptionIssues('feat: subject', FEATURE.replace('qui contrôle', '\n\nElle contrôle'))).toEqual([expect.stringContaining('“## Description” holds one sentence')])
    expect(descriptionIssues('feat: subject', FEATURE.replace('Ajoute la', '- Ajoute la'))).toEqual([expect.stringContaining('“## Description” holds one sentence')])
    expect(descriptionIssues('feat: subject', FEATURE.replace('- La commande', 'La commande'))).toEqual([expect.stringContaining('“## Modifications” is a list')])
  })

  it('refuses “=>” in the text, and reads a heading or “=>” in code as code', () => {
    expect(descriptionIssues('feat: subject', FEATURE.replace('`check` écrit', '`check` => écrit'))).toEqual([expect.stringContaining('Replace “=>”')])
    expect(descriptionIssues('feat: subject', `${FEATURE}\n\n\`const run = () => 1\`\n\n\`\`\`md\n## Titre d'un deck\na => b\n\`\`\``)).toEqual([])
  })
})
