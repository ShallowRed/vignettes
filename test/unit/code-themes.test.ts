import { readFileSync } from 'node:fs'
import { CODE_ROLES, CODE_THEMES, codeRolesTransformer, codeThemeStyle, resolveCodeTheme, ROLES_THEME, ROLES_THEME_KEY } from '@vignettes/core/render'
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
