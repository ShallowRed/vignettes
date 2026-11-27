import type { DeckProblem, DeckProblemSeverity } from '@vignettes/core/deck'
import type { CommandRun } from '../usage.ts'
import { checkDeck, problemCode } from '@vignettes/core/deck'
import { registerKnownComponents } from '../components.ts'
import { readDeck } from '../files.ts'
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

function checked(problem: DeckProblem): CheckedProblem {
  return { line: problem.line, column: problem.column, severity: problem.severity, code: problemCode(problem), message: problemMessage(problem) }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** The problems of each file, a line per problem, the column from 1 as editors read it. */
function report(results: CheckResult[]): string {
  const problems = results.flatMap(({ file, problems }) => problems.map(problem => ({ file, ...problem })))
  const count = (severity: DeckProblemSeverity) => problems.filter(problem => problem.severity === severity).length
  return [
    ...problems.map(({ file, line, column, severity, code, message }) => `${file}:${line}:${column + 1}  ${severity}  ${code}  ${message}`),
    `${plural(results.length, 'file')} checked: ${plural(count('error'), 'error')}, ${plural(count('warning'), 'warning')}, ${count('info')} info.`,
  ].join('\n')
}

/** Checks each file by `checkDeck`, after reading them all: a file that cannot be read stops the command. */
export const check: CommandRun = async ({ operands, output }) => {
  registerKnownComponents()
  const texts = await Promise.all(operands.map(readDeck))
  const results = operands.map((file, index) => ({ file, problems: checkDeck(texts[index]!).map(checked) }))
  output.print(report(results))
  const failed = results.some(result => result.problems.some(problem => problem.severity === 'error'))
  output.finish(results, failed ? EXIT_CODES.deckError : EXIT_CODES.success)
}
