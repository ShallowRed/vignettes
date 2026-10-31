import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveUiTheme, UI_THEMES } from '../../layers/studio/src/utils/ui-themes'

const css = (name: string) => readFileSync(new URL(`../../layers/studio/src/assets/css/themes/${name}.css`, import.meta.url), 'utf8')

describe('resolveUiTheme', () => {
  it('gives the theme of the instance, or the default one', () => {
    expect(resolveUiTheme('dsfr', 'lasuite', false)).toBe('dsfr')
    expect(resolveUiTheme('', null, false)).toBe('vignettes')
    expect(resolveUiTheme('unknown', null, false)).toBe('vignettes')
  })

  it('gives the theme a visitor chose where the trials are open', () => {
    expect(resolveUiTheme('dsfr', 'lasuite', true)).toBe('lasuite')
    expect(resolveUiTheme('dsfr', 'unknown', true)).toBe('dsfr')
  })
})

describe('the theme stylesheets', () => {
  it('declare every theme but the default one, which sets the values of :root', () => {
    for (const id of UI_THEMES.filter(id => id !== 'vignettes'))
      expect(css(id)).toContain(`:root[data-ui-theme='${id}']`)
    expect(css('vignettes')).toContain('--app-font-family')
  })
})
