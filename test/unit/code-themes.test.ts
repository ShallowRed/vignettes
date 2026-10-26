import type { CodeTheme } from '@vignettes/core/render'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CODE_ROLES, CODE_THEMES, codeRolesTransformer, codeThemeStyle, resolveCodeTheme, ROLES_THEME, ROLES_THEME_KEY } from '@vignettes/core/render'
import { builtInThemeRegistry } from '@vignettes/core/theme'
import * as sass from 'sass'
import { codeToHtml } from 'shiki'
import { describe, expect, it } from 'vitest'

describe('resolveCodeTheme', () => {
  it('reads a theme name', () => {
    expect(resolveCodeTheme('sombre')).toBe(CODE_THEMES.sombre)
  })

  it('applies properties over a base theme', () => {
    expect(resolveCodeTheme({ theme: 'clair', string: '#123456' })).toMatchObject({ key: CODE_THEMES.clair!.key, string: '#123456' })
  })

  it('accepts properties alone', () => {
    expect(resolveCodeTheme({ key: '#fff' })).toEqual({ key: '#fff' })
  })

  it('ignores an unknown name or no value', () => {
    expect(resolveCodeTheme('inconnu')).toBeUndefined()
    expect(resolveCodeTheme(undefined)).toBeUndefined()
  })
})

describe('codeThemeStyle', () => {
  it('maps the properties to CSS variables, sizes in pixels', () => {
    expect(codeThemeStyle({ key: '#fff', size: 13, dim: 0.7, keyWeight: 700 })).toEqual({
      '--code-key': '#fff',
      '--code-size': '13px',
      '--code-dim': '0.7',
      '--code-key-weight': '700',
    })
  })

  it('keeps a size with its unit', () => {
    expect(codeThemeStyle({ size: '0.6em' })).toEqual({ '--code-size': '0.6em' })
  })

  it('drops values that could close the declaration', () => {
    expect(codeThemeStyle({ key: 'red; background: url(x)', string: '#000' })).toEqual({ '--code-string': '#000' })
  })

  it('gives no variable without a theme', () => {
    expect(codeThemeStyle(undefined)).toEqual({})
  })
})

describe('codeRolesTransformer', () => {
  async function roles(code: string, lang: string) {
    const html = await codeToHtml(code, {
      lang,
      themes: { default: 'github-dark', [ROLES_THEME_KEY]: ROLES_THEME as any },
      defaultColor: false,
      transformers: [codeRolesTransformer() as any],
    })
    expect(html).not.toContain(`--shiki-${ROLES_THEME_KEY}`)
    return [...html.matchAll(/class="code-(\w+)">([^<]*)</g)].map(([, role, text]) => [role, text!.trim()])
  }

  it('classes the json tokens by role', async () => {
    expect(await roles('{"a": "x", "n": 1, "b": null}', 'json')).toEqual([
      ['punctuation', '{'],
      ['key', '"a"'],
      ['punctuation', ':'],
      ['string', '"x"'],
      ['punctuation', ','],
      ['key', '"n"'],
      ['punctuation', ':'],
      ['literal', '1'],
      ['punctuation', ','],
      ['key', '"b"'],
      ['punctuation', ':'],
      ['literal', 'null'],
      ['punctuation', '}'],
    ])
  })

  it('classes yaml keys and comments', async () => {
    expect(await roles('title: Hello # note', 'yaml')).toEqual([
      ['key', 'title'],
      ['punctuation', ':'],
      ['string', 'Hello'],
      ['comment', '# note'],
    ])
  })
})

describe('the stylesheet of the renderer', () => {
  const sheet = readFileSync(new URL('../../packages/nuxt/src/runtime/assets/code-theme.css', import.meta.url), 'utf8')

  it('colors every role from its variable', () => {
    for (const role of CODE_ROLES)
      expect(sheet).toContain(`.reveal--code-theme pre.shiki span.code-${role} {\n  color: var(--code-${role}, var(--shiki-default));`)
  })

  it('applies only to a deck that declares a code theme', () => {
    expect(sheet).not.toMatch(/^\.reveal pre/m)
  })
})

describe('the code theme a theme names', () => {
  it('is a known code theme for every application theme', () => {
    const { tokens } = builtInThemeRegistry()
    const named = Object.values(tokens).filter(t => t.code)
    expect(named.length).toBe(Object.keys(tokens).length)
    for (const tokens of named)
      expect(resolveCodeTheme(tokens.code)).toBeDefined()
  })
})

describe('the code themes under a theme', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const hex = (h: string) => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16) / 255)
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = (h: string) => {
    const [r, g, b] = hex(h).map(channel) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    return (high + 0.05) / (low + 0.05)
  }

  // The custom properties a stylesheet declares on :root, the last declaration winning.
  const rootTokens = (entry: string) => {
    const { css } = sass.compileString(`@use '${entry}';`, { loadPaths: [root], importers: [new sass.NodePackageImporter()] })
    const tokens = new Map<string, string>()
    for (const [, body] of css.matchAll(/^:root\s*\{([^}]*)\}/gm)) {
      for (const [, name, value] of body!.matchAll(/(--[\w-]+):\s*([^\s;][^;]*);/g))
        tokens.set(name!, value!.trim())
    }
    return tokens
  }

  // A value with its var() replaced, and a color as a #rrggbb value through color-mix(in srgb, …).
  const resolve = (value: string, tokens: Map<string, string>): string => {
    const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => resolve(tokens.get(name)!, tokens))
    const mix = /^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/.exec(resolved)
    if (mix) {
      const [a, b] = [resolve(mix[1]!, tokens), resolve(mix[3]!, tokens)].map(hex) as [number[], number[]]
      const share = Number(mix[2]) / 100
      return `#${a.map((c, i) => Math.round((c * share + b[i]! * (1 - share)) * 255).toString(16).padStart(2, '0')).join('')}`
    }
    const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(resolved)
    return short ? `#${short.slice(1).map(c => c + c).join('')}` : resolved.toLowerCase()
  }
  const resolveTheme = (theme: CodeTheme, tokens: Map<string, string>) =>
    Object.fromEntries(Object.entries(theme).map(([property, value]) => [property, typeof value === 'string' ? resolve(value, tokens) : value]))

  it('reads clair at AA against its own block under the kit defaults', () => {
    const theme = resolveTheme(CODE_THEMES.clair!, rootTokens('pkg:@vignettes/theme-kit'))
    for (const role of [...CODE_ROLES, 'text' as const])
      expect(contrast(theme[role] as string, theme.background as string)).toBeGreaterThanOrEqual(4.5)
  })

  it('reads the text of nuit at AA under a dark theme', () => {
    const theme = resolveTheme(CODE_THEMES.nuit!, rootTokens('examples/themes/exemple-sombre/exemple-sombre'))
    expect(contrast(theme.text as string, theme.background as string)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the DSFR tones under the dsfr theme', () => {
    const tokens = rootTokens('pkg:@vignettes/theme-dsfr')
    expect(resolveTheme(CODE_THEMES.clair!, tokens)).toEqual({
      background: '#f6f6f6',
      border: '1px solid #dddddd',
      text: '#161616',
      key: '#000091',
      string: '#297254',
      literal: '#6e445a',
      keyword: '#c9191e',
      function: '#3558a2',
      comment: '#666666',
      punctuation: '#3a3a3a',
      keyWeight: 700,
      size: 13,
      dim: 0.7,
      activeBackground: '#e3e3fd',
      activeBar: '#000091',
    })
    expect(resolveTheme(CODE_THEMES.nuit!, tokens)).toMatchObject({ background: '#1b1b35', activeBar: '#8585f6' })
  })
})
