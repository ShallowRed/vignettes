import type { DeckProblem, DeckProblemSeverity } from '@vignettes/core/deck'
import type { CommandRun } from '../usage.ts'
import { problemCode } from '@vignettes/core/deck'
import { registerKnownComponents } from '../components.ts'
import { readLocalDeck } from '../local-deck.ts'
import { problemMessage } from '../messages.ts'
import { EXIT_CODES } from '../output.ts'

/** A problem of the `--json` document: `line` from 1, `column` from 0, as in the core. */
export interface CheckedProblem {
  line: number
  column: number
  severity: DeckProblemSeverity
  code: string
  message: string
}

export interface CheckResult {
  file: string
  problems: CheckedProblem[]
}

export function checked(problem: DeckProblem): CheckedProblem {
  return { line: problem.line, column: problem.column, severity: problem.severity, code: problemCode(problem), message: problemMessage(problem) }
}

/** A problem on its line of the text output: the file, the place with the column from 1 as editors read it, the severity, the code and the message. */
export function problemLine(file: string, { line, column, severity, code, message }: CheckedProblem): string {
  return `${file}:${line}:${column + 1}  ${severity}  ${code}  ${message}`
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** The problems of each file, a line per problem. */
function report(results: CheckResult[]): string {
  const problems = results.flatMap(({ file, problems }) => problems.map(problem => ({ file, ...problem })))
  const count = (severity: DeckProblemSeverity) => problems.filter(problem => problem.severity === severity).length
  return [
    ...problems.map(({ file, ...problem }) => problemLine(file, problem)),
    `${plural(results.length, 'file')} checked: ${plural(count('error'), 'error')}, ${plural(count('warning'), 'warning')}, ${count('info')} info.`,
  ].join('\n')
}

/**
 * Checks each file and its local images by `readLocalDeck`, after reading them
 * all: a file that cannot be read stops the command.
 */
export const check: CommandRun = async ({ operands, output }) => {
  registerKnownComponents()
  const decks = []
  for (const file of operands)
    decks.push(await readLocalDeck(file))
  const results = decks.map(({ file, problems }) => ({ file, problems: problems.map(checked) }))
  output.print(report(results))
  const failed = results.some(result => result.problems.some(problem => problem.severity === 'error'))
  output.finish(results, failed ? EXIT_CODES.deckError : EXIT_CODES.success)
}
