import process from 'node:process'
import { isCancel, password } from '@clack/prompts'
import { CliError } from './messages.ts'

/** Asks for a secret on the standard error, without showing what the person types. */
export async function askSecret(message: string): Promise<string> {
  const answer = await password({ message, output: process.stderr })
  if (isCancel(answer))
    throw new CliError('interrupted')
  return answer
}

/** The whole standard input, for `--token-stdin`. */
export async function readStandardInput(input: NodeJS.ReadableStream = process.stdin): Promise<string> {
  let text = ''
  input.setEncoding('utf8')
  for await (const chunk of input)
    text += chunk
  return text
}
