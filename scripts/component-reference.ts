#!/usr/bin/env node
/**
 * Writes the reference of each deck component into the README of its package,
 * between `<!-- component: Name -->` and `<!-- /component -->`: its other
 * names, the example the editor inserts, its attributes and its content. The
 * names and the example come from the deck contract, the attributes and the
 * content from the `defineProps`, `withDefaults` and `defineSlots` of its Vue
 * file and their JSDoc. It writes the attributes as data too, in the
 * `component-attributes.ts` of the package, which the editor reads with the
 * French description that a prop's JSDoc gives after `@fr`.
 * `test/unit/component-reference.test.ts` fails when a README or a data file
 * drifts from its components.
 */
import type { ComponentAttribute, DeckComponent } from '@vignettes/core/deck'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { BUILT_IN_COMPONENTS, exampleSource } from '@vignettes/core/deck'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import { compileScript, parse } from 'vue/compiler-sfc'

const PACKAGES = [
  { readme: 'packages/nuxt/README.md', dir: 'packages/nuxt/src/runtime/components/mdc', components: BUILT_IN_COMPONENTS, data: { file: 'packages/core/src/deck/component-attributes.ts', name: 'BUILT_IN_ATTRIBUTES', types: './components.ts' } },
  { readme: 'packages/schemas/README.md', dir: 'packages/schemas/src/runtime/components', components: SCHEMA_COMPONENTS, data: { file: 'packages/schemas/src/component-attributes.ts', name: 'SCHEMA_ATTRIBUTES', types: '@vignettes/core/deck' } },
  { readme: 'packages/storybook/README.md', dir: 'packages/storybook/src/runtime/components', components: STORYBOOK_COMPONENTS, data: { file: 'packages/storybook/src/component-attributes.ts', name: 'STORYBOOK_ATTRIBUTES', types: '@vignettes/core/deck' } },
]

const BLOCK = /<!-- component: (\w+) -->\n[\s\S]*?<!-- \/component -->/g

interface Entry {
  name: string
  type: string
  optional: boolean
  description: string
  /** The description after `@fr` in the JSDoc. */
  fr?: string
}

interface ComponentApi {
  props: (Entry & { default?: string })[]
  slots: Entry[]
}

type Node = { type: string, start: number, end: number, leadingComments?: { type: string, value: string }[] } & Record<string, any>

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node))
    return node.forEach(child => walk(child, visit))
  if (!node || typeof node !== 'object' || !('type' in node))
    return
  visit(node as Node)
  for (const [key, value] of Object.entries(node)) {
    if (!['leadingComments', 'trailingComments', 'innerComments', 'loc'].includes(key))
      walk(value, visit)
  }
}

function jsdoc(node: Node): { description: string, fr?: string } {
  const comment = node.leadingComments?.findLast(c => c.type === 'CommentBlock' && c.value.startsWith('*'))
  const [description, fr] = (comment?.value ?? '')
    .split('\n')
    .map(line => line.replace(/^\s*\*+\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .split(/\s*@fr\s+/)
  return { description: description ?? '', fr }
}

function callee(node: Node, name: string): boolean {
  return node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name
}

/**
 * Reads the props, their defaults and the slots a component declares in its
 * `<script setup>`. The script reads a type literal, or an interface or a type
 * alias of the same file without `extends`, and throws on any other declaration.
 */
export function readComponent(file: string): ComponentApi {
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: file })
  if (!descriptor.scriptSetup)
    return { props: [], slots: [] }
  const source = descriptor.scriptSetup.content
  const { scriptSetupAst } = compileScript(descriptor, { id: file })
  const text = (node: Node) => source.slice(node.start, node.end)
  const entries = (members: Node[]): Entry[] => members.map(member => ({
    name: member.key.name,
    type: member.typeAnnotation ? text(member.typeAnnotation.typeAnnotation) : '',
    optional: Boolean(member.optional),
    ...jsdoc(member),
  }))

  const types = new Map<string, Node[]>()
  walk(scriptSetupAst, (node) => {
    if (node.type === 'TSInterfaceDeclaration' && !node.extends?.length)
      types.set(node.id.name, node.body.body)
    if (node.type === 'TSTypeAliasDeclaration' && node.typeAnnotation.type === 'TSTypeLiteral')
      types.set(node.id.name, node.typeAnnotation.members)
  })
  const membersOf = (call: Node, macro: string): Node[] => {
    const typeArgument: Node | undefined = call.typeParameters?.params[0]
    const members = typeArgument?.type === 'TSTypeLiteral' ? typeArgument.members : types.get(typeArgument?.typeName?.name)
    if (call.arguments.length || !members)
      throw new Error(`${file}: declare ${macro} with a type literal, or an interface or a type of this file without extends`)
    return members
  }

  const defaults = new Map<string, string>()
  let props: Node[] = []
  let slots: Node[] = []
  walk(scriptSetupAst, (node) => {
    if (callee(node, 'withDefaults') && node.arguments[1]?.type === 'ObjectExpression') {
      for (const property of node.arguments[1].properties)
        defaults.set(property.key.name, text(property.value))
    }
    if (callee(node, 'defineProps'))
      props = membersOf(node, 'defineProps')
    if (callee(node, 'defineSlots'))
      slots = membersOf(node, 'defineSlots')
  })
  return {
    props: entries(props).map(prop => ({ ...prop, default: defaults.get(prop.name) })),
    slots: entries(slots),
  }
}

function attributeLine(prop: ComponentApi['props'][number]): string {
  const details = [`\`${prop.type}\``]
  if (!prop.optional)
    details.push('required')
  if (prop.default !== undefined)
    details.push(`default \`${prop.default}\``)
  return `- \`${prop.name}\` (${details.join(', ')}): ${prop.description}`
}

function example(snippet: string): string[] {
  const code = snippet.replace(/\$\{([^}]*)\}/g, '$1')
  const fence = code.includes('```') ? '````' : '```'
  return [`${fence}markdown`, code, fence]
}

/** The reference of a component as the README shows it between its markers. */
export function componentBlock(component: DeckComponent, api: ComponentApi, file: string): string {
  const undocumented = [...api.props, ...api.slots].filter(entry => !entry.description).map(entry => entry.name)
  if (undocumented.length)
    throw new Error(`${file}: write a JSDoc comment on ${undocumented.join(', ')}`)
  const lines: string[] = []
  if (component.aliases?.length)
    lines.push(`Also written ${component.aliases.map(alias => `\`${alias}\``).join(', ')}.`, '')
  if (component.example)
    lines.push(...example(exampleSource(component.name, component.example, 'en')), '')
  if (api.props.length)
    lines.push('Attributes:', '', ...api.props.map(attributeLine), '')
  for (const slot of api.slots)
    lines.push(slot.name === 'default' ? `Content: ${slot.description}` : `Slot \`${slot.name}\`: ${slot.description}`, '')
  return [`<!-- component: ${component.name} -->`, '', ...lines, '<!-- /component -->'].join('\n')
}

const STRING_LITERAL = /^'([^']*)'$/

/** The attribute a prop gives to the editor. */
export function componentAttribute(prop: ComponentApi['props'][number], file: string): ComponentAttribute {
  if (!prop.fr)
    throw new Error(`${file}: write the French description of ${prop.name} after @fr in its JSDoc`)
  const members = prop.type.split('|').map(member => member.trim())
  const values = members.every(member => STRING_LITERAL.test(member)) ? members.map(member => member.replace(STRING_LITERAL, '$1')) : undefined
  const fallback = prop.default?.replace(STRING_LITERAL, '$1')
  return {
    name: prop.name,
    ...(values ? { values } : {}),
    ...(prop.type === 'boolean' ? { boolean: true } : {}),
    ...(prop.type !== 'boolean' && members.includes('boolean') ? { acceptsTrue: true } : {}),
    ...(prop.optional ? {} : { required: true }),
    ...(fallback === undefined ? {} : { default: fallback }),
    description: { fr: prop.fr, en: prop.description },
  }
}

const quoted = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`

function attributeSource(attribute: ComponentAttribute): string {
  const fields = [`name: ${quoted(attribute.name)}`]
  if (attribute.values)
    fields.push(`values: [${attribute.values.map(quoted).join(', ')}]`)
  if (attribute.boolean)
    fields.push('boolean: true')
  if (attribute.acceptsTrue)
    fields.push('acceptsTrue: true')
  if (attribute.required)
    fields.push('required: true')
  if (attribute.default !== undefined)
    fields.push(`default: ${quoted(attribute.default)}`)
  fields.push(`description: { fr: ${quoted(attribute.description.fr!)}, en: ${quoted(attribute.description.en!)} }`)
  return `    { ${fields.join(', ')} },`
}

/** The `component-attributes.ts` of a package: the attributes of its components, by component name. */
export function attributesSource(name: string, types: string, attributes: Record<string, readonly ComponentAttribute[]>): string {
  const entries = Object.entries(attributes).filter(([, list]) => list.length)
  return [
    '// Written by `node scripts/component-reference.ts` from the props of the components.',
    `import type { ComponentAttribute } from '${types}'`,
    '',
    `export const ${name}: Readonly<Record<string, readonly ComponentAttribute[]>> = {`,
    ...entries.flatMap(([component, list]) => [`  ${component}: [`, ...list.map(attributeSource), '  ],']),
    '}',
    '',
  ].join('\n')
}

/** The READMEs with the reference of their components, and the data files of their attributes, by path from the repository root. */
export function componentReferenceFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const { readme, dir, components, data } of PACKAGES) {
    const content = readFileSync(join(root, readme), 'utf8')
    const marked = [...content.matchAll(BLOCK)].map(match => match[1])
    const missing = components.map(c => c.name).filter(name => !marked.includes(name))
    if (missing.length)
      throw new Error(`${readme}: add a <!-- component: Name --> <!-- /component --> block for ${missing.join(', ')}`)
    const attributes: Record<string, readonly ComponentAttribute[]> = {}
    files[readme] = content.replace(BLOCK, (_, name: string) => {
      const component = components.find(c => c.name === name)
      if (!component)
        throw new Error(`${readme}: ${name} is not a component of this package`)
      const file = join(dir, `${component.component ?? component.name}.vue`)
      const api = readComponent(join(root, file))
      attributes[component.name] = api.props.map(prop => componentAttribute(prop, file))
      return componentBlock(component, api, file)
    })
    files[data.file] = attributesSource(data.name, data.types, attributes)
  }
  return files
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = componentReferenceFiles(root)
  for (const [path, content] of Object.entries(files))
    writeFileSync(join(root, path), content)
  console.log(`✓ ${Object.keys(files).length} README(s) and attribute files written; run \`node scripts/deck-plugin.ts\` to copy them into the deck plugin`)
}
