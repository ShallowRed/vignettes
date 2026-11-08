import type { LocalizedText } from './components.ts'
import type { TextChange } from './text-edits.ts'
import { frontmatterLineCount } from './frontmatter.ts'
import { layoutAnnotationChange, layoutAnnotations, layoutAnnotationValues, layoutSource, readLayout } from './layout.ts'
import { lineStarts } from './text-edits.ts'

/**
 * The forms of the earlier format that a deck may still hold and that a
 * conversion rewrites into the current format. The parser reads the ones that have an
 * effect. The editor marks each form and converts it, the content import names
 * the decks that hold one, and the reference of the deck authoring plugin
 * lists them.
 */

export interface LegacyForm {
  /** The form as a deck writes it: `parser`, `:layout{name=…}`. */
  written: string
  /** The current form it converts into; none for a form without effect, which the conversion removes. */
  current?: string
  description: LocalizedText
}

/** Where the conversion moves a root key: a root key, or a key under a root key; none for a key it removes. */
interface KeyForm {
  to?: readonly [string] | readonly [string, string]
  description: LocalizedText
}

/** The root keys of the frontmatter that the earlier format writes, by name. */
const FRONTMATTER_FORMS = {
  parser: {
    to: ['syntax', 'split'],
    description: { fr: 'Ancienne écriture de `split` sous la clé `syntax`.', en: 'Earlier form of `split` under the `syntax` key.' },
  },
  access: {
    to: ['status'],
    description: { fr: 'Ancienne écriture de `status`.', en: 'Earlier form of `status`.' },
  },
  transition: {
    to: ['reveal', 'transition'],
    description: { fr: 'Sans effet à la racine : écrivez la transition sous la clé `reveal`.', en: 'No effect at the root: write the transition under the `reveal` key.' },
  },
  center: {
    description: { fr: 'Sans effet : écrivez l\'alignement vertical d\'une diapositive dans l\'attribut `align` de `:layout`.', en: 'No effect: write the vertical alignment of a slide in the `align` attribute of `:layout`.' },
  },
} satisfies Record<string, KeyForm>

type FrontmatterFormId = keyof typeof FRONTMATTER_FORMS

export type LegacyFormId = FrontmatterFormId | 'layout'

export const LEGACY_FORMS: Readonly<Record<LegacyFormId, LegacyForm>> = {
  ...Object.fromEntries(Object.entries<KeyForm>(FRONTMATTER_FORMS).map(([key, { to, description }]) =>
    [key, { written: key, ...(to ? { current: to.join('.') } : {}), description }])) as Record<FrontmatterFormId, LegacyForm>,
  layout: {
    written: ':layout{name=…}',
    current: ':layout{media=… size=…}',
    description: {
      fr: 'Ancienne écriture des attributs de `:layout` : `name="media-right-wide"`, `previewWidth`, `title`, `raw`.',
      en: 'Earlier form of the attributes of `:layout`: `name="media-right-wide"`, `previewWidth`, `title`, `raw`.',
    },
  },
}

/** The root keys of the frontmatter that only the earlier format writes. */
export const LEGACY_FRONTMATTER_KEYS: readonly string[] = Object.keys(FRONTMATTER_FORMS)

function isFrontmatterForm(key: string): key is FrontmatterFormId {
  return Object.hasOwn(FRONTMATTER_FORMS, key)
}

/** A legacy form written in a deck, and the changes that convert it. */
export interface LegacyMention {
  form: LegacyFormId
  /** 1-based line, 0-based column and length of the marked text. */
  line: number
  column: number
  length: number
  /** Empty when the form is written in a way the conversion does not rewrite (a flow mapping, a value on the next lines). */
  changes: TextChange[]
}

const ROOT_KEY_RE = /^([A-Z_][\w-]*)[ \t]*:(.*)$/i
const CHILD_KEY_RE = /^([ \t]+)([A-Z_][\w-]*)[ \t]*:/i

interface RootEntry {
  key: string
  value: string
  /** 0-based index of its line. */
  index: number
  /** 0-based indexes of the lines under it, the last non-blank one included. */
  children: number[]
}

/** The legacy forms a deck holds, in the order of the text. */
export function legacyMentions(raw: string): LegacyMention[] {
  return [...frontmatterMentions(raw), ...layoutFormMentions(raw)]
}

function rootEntries(raw: string, lines: string[]): RootEntry[] {
  const entries: RootEntry[] = []
  // The block opens and closes with a `---` line.
  const end = frontmatterLineCount(raw) - 1
  for (let index = 1; index < end; index++) {
    const line = lines[index]!
    const match = ROOT_KEY_RE.exec(line)
    if (match) {
      entries.push({ key: match[1]!, value: match[2]!.trim(), index, children: [] })
    }
    else if (/^\s/.test(line) && line.trim() && entries.length) {
      entries.at(-1)!.children.push(index)
    }
  }
  return entries
}

function frontmatterMentions(raw: string): LegacyMention[] {
  const lines = raw.split('\n')
  const starts = lineStarts(raw)
  const entries = rootEntries(raw, lines)
  const removeLine = (index: number): TextChange => ({ from: starts[index]!, to: starts[index + 1]!, insert: '' })
  return entries.flatMap((entry) => {
    if (!isFrontmatterForm(entry.key))
      return []
    const form: KeyForm = FRONTMATTER_FORMS[entry.key]
    const mention = { form: entry.key, line: entry.index + 1, column: 0, length: entry.key.length }
    if (!form.to)
      return [{ ...mention, changes: [removeLine(entry.index)] }]
    if (!entry.value || entry.children.length)
      return [{ ...mention, changes: [] }]
    const [root, child] = form.to
    const target = entries.find(candidate => candidate.key === root)
    if (!child) {
      const changes = target ? [removeLine(entry.index)] : [{ from: starts[entry.index]!, to: starts[entry.index]! + entry.key.length, insert: root }]
      return [{ ...mention, changes }]
    }
    if (!target) {
      const lineEnd = starts[entry.index]! + lines[entry.index]!.replace(/\r$/, '').length
      return [{ ...mention, changes: [{ from: starts[entry.index]!, to: lineEnd, insert: `${root}:\n  ${child}: ${entry.value}` }] }]
    }
    // The current form, when written, wins over the earlier one.
    const written = target.children.map(index => CHILD_KEY_RE.exec(lines[index]!)).filter(match => match !== null)
    if (written.some(match => match[2] === child))
      return [{ ...mention, changes: [removeLine(entry.index)] }]
    if (target.value)
      return [{ ...mention, changes: [] }]
    const indent = written[0]?.[1] ?? '  '
    const last = target.children.at(-1) ?? target.index
    const at = starts[last]! + lines[last]!.replace(/\r$/, '').length
    return [{ ...mention, changes: [{ from: at, to: at, insert: `\n${indent}${child}: ${entry.value}` }, removeLine(entry.index)] }]
  })
}

function layoutFormMentions(raw: string): LegacyMention[] {
  return layoutAnnotations(raw).flatMap((annotation) => {
    const values = layoutAnnotationValues(annotation)
    if (!readLayout(values).issues.some(issue => issue.kind === 'legacy'))
      return []
    const { line, column, length } = annotation
    return [{ form: 'layout' as const, line, column, length, changes: [layoutAnnotationChange(raw, annotation, layoutSource(values))] }]
  })
}
