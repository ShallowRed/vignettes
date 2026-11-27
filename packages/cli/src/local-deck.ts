import type { DeckProblem, LocalImageFact } from '@vignettes/core/deck'
import type { ImageType } from '@vignettes/core/media'
import { basename } from 'node:path'
import { checkDeck, checkDeckFiles, checkDeckWrite, deckImageSources, splitFrontmatter, withImageSources } from '@vignettes/core/deck'
import { mediaName } from '@vignettes/core/media'
import { deckFolder, readDeck, readImage } from './files.ts'

/** A local image that an instance accepts, with the name it is uploaded under. */
export interface LocalImage {
  /** Its path as the deck writes it, decoded, relative to the folder of the deck. */
  path: string
  data: Uint8Array
  type: ImageType
  name: string
}

/** A deck file as the command line reads it: its text, the text it sends to an instance, its images and its problems. */
export interface LocalDeck {
  file: string
  raw: string
  /** The text where each local image source is replaced by `/media/<name>`. */
  sent: string
  images: LocalImage[]
  /** The problems of `checkDeck`, `checkDeckFiles` and `checkDeckWrite`, in the order of the text. */
  problems: DeckProblem[]
}

/**
 * Reads a deck file and its local images, then checks the text, the images
 * and the text sent to an instance. A file that cannot be read stops the
 * command; an image that cannot be read is a problem of the deck.
 */
export async function readLocalDeck(file: string): Promise<LocalDeck> {
  const raw = await readDeck(file)
  const folder = await deckFolder(file)
  const facts = new Map<string, LocalImageFact>()
  const images: LocalImage[] = []
  for (const { source } of deckImageSources(raw)) {
    if (source.kind !== 'local' || facts.has(source.path))
      continue
    const read = await readImage(folder, source.path)
    facts.set(source.path, read.state === 'read' ? { state: 'read', bytes: read.bytes, ...(read.type && { type: read.type }) } : read)
    if (read.state === 'read' && read.type && read.data)
      images.push({ path: source.path, data: read.data, type: read.type, name: await mediaName(read.data, read.type) })
  }
  const names = new Map(images.map(image => [image.path, image.name]))
  const { text: sent, unplaced, left } = withImageSources(raw, names)
  const problems = [...checkDeck(raw), ...checkDeckFiles(raw, facts)]
  for (const { value, line, column, length } of unplaced) {
    if (!problems.some(problem => problem.check === 'image-unplaced' && problem.line === line && problem.column === column))
      problems.push({ value, line, column, length, check: 'image-unplaced', severity: 'error' })
  }
  const { project } = splitFrontmatter(raw).data
  problems.push(...checkDeckWrite(sent, { slug: basename(file).replace(/\.md$/, ''), left, ...(typeof project === 'string' && { project }) }))
  return { file, raw, sent, images, problems: problems.sort((a, b) => a.line - b.line || a.column - b.column) }
}
