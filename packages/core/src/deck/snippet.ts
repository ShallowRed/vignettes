import type { AnnotationExample, ComponentExample, ExampleText, NestedExample } from './components.ts'
import { attributeSource } from './attributes.ts'
import { inLanguage } from './components.ts'

/**
 * The MDC text of a component's example: `:name{…}` in a line, or a `::Name{…}`
 * block holding its content, with one more colon per level of blocks inside.
 */
export function exampleSource(name: string, example: ComponentExample, lang: string): string {
  const opening = `${exampleOpening(name, example)}${attributesSource(example, lang)}`
  if (example.inline)
    return opening
  const content = (example.content ?? []).map(part => isNested(part) ? exampleSource(part.name, part, lang) : inLanguage(part, lang))
  return [opening, ...content, colons(example)].join('\n')
}

/** The MDC text of an annotation's example: `:tag{…}`. */
export function annotationSource(tag: string, example: AnnotationExample, lang: string): string {
  return exampleSource(tag, { ...example, inline: true }, lang)
}

/** The text that opens the example in a deck: `:i`, `::Quote`, `:::Columns`. */
export function exampleOpening(name: string, example: ComponentExample): string {
  return `${colons(example)}${example.name ?? name}`
}

function colons(example: ComponentExample): string {
  return ':'.repeat(example.inline ? 1 : 2 + blockDepth(example))
}

function blockDepth(example: ComponentExample): number {
  const nested = (example.content ?? []).filter(isNested).filter(part => !part.inline)
  return Math.max(0, ...nested.map(part => 1 + blockDepth(part)))
}

function attributesSource(example: ComponentExample, lang: string): string {
  const attributes = Object.entries(example.attributes ?? {})
    .map(([name, value]) => value === true ? name : attributeSource(name, inLanguage(value, lang)))
  return attributes.length ? `{${attributes.join(' ')}}` : ''
}

function isNested(part: ExampleText | NestedExample): part is NestedExample {
  return typeof part === 'object' && typeof part.name === 'string'
}
