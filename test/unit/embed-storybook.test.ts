import { existsSync } from 'node:fs'
import {
  detectAssetRoots,
  isStorybookRuntime,
  STORYBOOK_FREEZE_STEPS,
  STORYBOOK_RUNTIME,
} from '@vignettes/core/render'
import { describe, expect, it } from 'vitest'

describe('isStorybookRuntime', () => {
  it('flags the named runtime shell, manifests and bundle dirs', () => {
    for (const name of STORYBOOK_RUNTIME)
      expect(isStorybookRuntime(name)).toBe(true)
  })

  it('flags any .js or .json file as runtime', () => {
    expect(isStorybookRuntime('runtime~main.abc.js')).toBe(true)
    expect(isStorybookRuntime('stories.json')).toBe(true)
  })

  it('does NOT flag staticDir asset roots', () => {
    expect(isStorybookRuntime('vitrine')).toBe(false)
    expect(isStorybookRuntime('fonts')).toBe(false)
    expect(isStorybookRuntime('favicon.ico')).toBe(false)
  })
})

describe('detectAssetRoots', () => {
  it('keeps only the re-baseable static-asset roots', () => {
    const entries = [
      // runtime — dropped
      'index.html',
      'iframe.html',
      'assets',
      'sb-manager',
      'runtime~main.js',
      'stories.json',
      '.well-known',
      // hidden dotfile — dropped
      '.nojekyll',
      // static-asset roots — kept
      'vitrine',
      'fonts',
      'images',
      'favicon.ico',
    ]
    expect(detectAssetRoots(entries)).toEqual([
      'vitrine',
      'fonts',
      'images',
      'favicon.ico',
    ])
  })

  it('returns [] for a Storybook with no static assets', () => {
    expect(detectAssetRoots(['index.html', 'iframe.html', 'assets', 'main.js']))
      .toEqual([])
  })

  it('accepts any iterable (Set)', () => {
    expect(detectAssetRoots(new Set(['vitrine', 'index.html']))).toEqual(['vitrine'])
  })
})

describe('storybook freeze steps', () => {
  it('declares the embed passes in the order the freeze runs them', () => {
    expect(STORYBOOK_FREEZE_STEPS.map(s => s.id)).toEqual([
      'prune',
      'rebase',
      'link',
    ])
  })

  it('points each step at its implementing script', () => {
    for (const step of STORYBOOK_FREEZE_STEPS) {
      expect(existsSync(step.script), step.script).toBe(true)
      expect(step.description.length).toBeGreaterThan(0)
    }
  })
})
