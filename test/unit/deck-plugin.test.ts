import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deckPluginFiles } from '../../scripts/deck-plugin.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('authoring plugins', () => {
  it('carries the references its sources produce: run `node scripts/deck-plugin.ts` after changing them', () => {
    for (const [path, content] of Object.entries(deckPluginFiles(root)))
      expect(readFileSync(join(root, path), 'utf8'), path).toBe(content)
  })
})
