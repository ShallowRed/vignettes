import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { componentBlock, componentReferenceFiles, readComponent } from '../../scripts/component-reference.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function component(script: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'component-reference-')), 'Sample.vue')
  writeFileSync(file, `<script setup lang="ts">\n${script}\n</script>\n\n<template><div /></template>\n`)
  return file
}

describe('component reference', () => {
  it('matches the props of the components: run `node scripts/component-reference.ts` after changing them', () => {
    for (const [path, content] of Object.entries(componentReferenceFiles(root)))
      expect(readFileSync(join(root, path), 'utf8'), path).toBe(content)
  })

  it('reads a type alias declared after the call', () => {
    const file = component('withDefaults(defineProps<Props>(), { size: \'md\' })\ntype Props = {\n  /** Scale. */\n  size?: \'sm\' | \'md\'\n}')
    expect(readComponent(file).props).toEqual([{ name: 'size', type: '\'sm\' | \'md\'', optional: true, description: 'Scale.', default: '\'md\'' }])
  })

  it('refuses props it cannot read', () => {
    expect(() => readComponent(component('import type { Props } from \'./props\'\ndefineProps<Props>()'))).toThrow()
    expect(() => readComponent(component('interface Base { a?: string }\ninterface Props extends Base { b?: string }\ndefineProps<Props>()'))).toThrow(/declare defineProps/)
    expect(() => readComponent(component('defineProps({ a: String })'))).toThrow(/declare defineProps/)
    expect(() => readComponent(component('defineProps<{\n/** A. @symbol picto @fr B */\na?: string }>()'))).toThrow(/@symbol takes/)
  })

  it('asks for a JSDoc comment on each prop and slot', () => {
    const file = component('defineProps<{ a?: string }>()')
    expect(() => componentBlock({ name: 'Sample' }, readComponent(file), file)).toThrow(/JSDoc comment on a/)
  })
})
