import type { ComponentAttributeIssue, DeckFileIssueReason, DeckProblem, FrontmatterProblem, LayoutMention } from '@vignettes/core/deck'
import { inLanguage, LEGACY_FORMS } from '@vignettes/core/deck'

type Problem<Check extends DeckProblem['check']> = Extract<DeckProblem, { check: Check }>

// A copy of the English sentences of the studio (layers/studio/i18n/locales/en/editor.json
// and catalog.json), without the help that points at the screen of the studio;
// test/unit/cli-commands.test.ts compares them.
const MALFORMED: Record<Problem<'malformed'>['reason'], (name: string) => string> = {
  brace: name => `Add the } brace that closes the attributes of “${name}”.`,
  quote: name => `Add the " quote that closes a value of “${name}”.`,
  typographic: name => `Replace the « » or “ ” quotes in the attributes of “${name}” with straight quotes ".`,
}

const COMPONENT_ATTRIBUTE: Record<ComponentAttributeIssue['kind'], (problem: ComponentAttributeIssue) => string> = {
  'unknown': ({ component, name }) => `Unknown attribute of ${component}: “${name}”.`,
  'false-text': ({ name }) => `${name}="false" is read as a text, so as true: write :${name}="false".`,
  'no-value': ({ component, name }) => `“${name}” has no value: ${component} ignores it. Write ${name}="…".`,
  'missing': ({ component, name }) => `${component} is missing the attribute “${name}”.`,
}

const REFUSED: Record<Problem<'refused'>['reason'], string> = {
  url: 'Address refused: write an address that starts with https://, or a path of this site that starts with /.',
  binding: 'Attribute refused: after “:”, write true, false, a number or a text between quotes, and remove v-bind, v-on, @ and v-model.',
  http: 'http:// address: the browser blocks this frame, image or video in the studio. Write the address with https://, or with http://localhost for a server on your computer.',
}

const EXPECTED: Record<NonNullable<FrontmatterProblem['expected']>, string> = {
  number: 'Value refused: this key takes a number, such as 1280.',
  boolean: 'Value refused: this key takes true or false.',
  string: 'Value refused: this key takes a text.',
}

const FRONTMATTER: Record<DeckFileIssueReason, (problem: FrontmatterProblem) => string> = {
  'unclosed': () => 'Open front matter: add a --- line above this heading to close it.',
  'unreadable': () => 'Unreadable front matter line: write one key per line, as key: value.',
  'no-title': () => 'The file\'s front matter gives no title: add the title key.',
  'address': () => REFUSED.url,
  'value': ({ key, expected, values }) => expected
    ? EXPECTED[expected]
    : values ? `Expected value: ${values.join(', ')}.` : `Value of “${key}” refused.`,
}

const LAYOUT: Record<LayoutMention['kind'], (attribute: string) => string> = {
  'unknown-attribute': attribute => `Unknown :layout attribute: “${attribute}”.`,
  'invalid-value': attribute => `Unknown value for “${attribute}”.`,
  'missing-source': () => 'Media without an address: add the src or story attribute.',
  'unused': attribute => `Remove “${attribute}”: this attribute has no effect with this placement of the media.`,
  'behind-needs-image': () => 'Behind the text, the media is an image: enter its address in src.',
}

/** One sentence per code of `PROBLEM_CODES`, in English. */
export function problemMessage(problem: DeckProblem): string {
  switch (problem.check) {
    case 'malformed':
      return MALFORMED[problem.reason](problem.name)
    case 'component-attribute':
      return COMPONENT_ATTRIBUTE[problem.kind](problem)
    case 'unclosed':
      return `Component ${problem.colons}${problem.name} open to the end of the text: add a ${problem.colons} line after its content. Without it, the slides that follow go into this component.`
    case 'refused':
      return REFUSED[problem.reason]
    case 'layout':
      return LAYOUT[problem.kind](problem.attribute)
    case 'legacy':
      return `${LEGACY_FORMS[problem.form].written}: ${inLanguage(LEGACY_FORMS[problem.form].description, 'en')}`
    case 'frontmatter':
      return FRONTMATTER[problem.reason](problem)
    case 'unknown-component':
      return `Unknown component “${problem.name}”: the studio shows its content without formatting.`
    case 'unknown-theme':
      return `The theme “${problem.theme}” is not among the themes built into the command line: an instance may publish it.`
  }
}

export type CliErrorCode
  = | 'missing-command'
    | 'unknown-command'
    | 'unknown-option'
    | 'missing-option-value'
    | 'unexpected-option-value'
    | 'unexpected-operand'
    | 'missing-operand'
    | 'missing-file'
    | 'unreadable-file'
    | 'internal'
    | 'interrupted'

const CLI_ERRORS: Record<CliErrorCode, (detail: string) => string> = {
  'missing-command': () => 'Name a command: run vignettes --help for the list.',
  'unknown-command': name => `Unknown command “${name}”: run vignettes --help for the list.`,
  'unknown-option': name => `Unknown option “${name}”: run the command with --help for its options.`,
  'missing-option-value': name => `The option “${name}” takes a value: write ${name} <value>.`,
  'unexpected-option-value': name => `The option “${name}” takes no value.`,
  'unexpected-operand': operand => `Unexpected argument “${operand}”: this command takes no file or name after it.`,
  'missing-operand': operand => `Give at least one <${operand}> after the command.`,
  'missing-file': file => `The file “${file}” does not exist.`,
  'unreadable-file': file => `The file “${file}” cannot be read.`,
  'internal': detail => `Internal error of the command line: ${detail}`,
  'interrupted': () => 'Stopped by Ctrl+C.',
}

/** An issue of a command, by its code; `detail` names what the message is about. */
export class CliError extends Error {
  readonly code: CliErrorCode

  constructor(code: CliErrorCode, detail = '') {
    super(CLI_ERRORS[code](detail))
    this.code = code
  }
}
