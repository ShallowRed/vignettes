import { readFile } from 'node:fs/promises'
import { CliError } from './messages.ts'

/** The text of a deck file; a file that does not exist or cannot be read stops the command. */
export async function readDeck(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  }
  catch (error) {
    throw new CliError((error as { code?: string }).code === 'ENOENT' ? 'missing-file' : 'unreadable-file', file)
  }
}
