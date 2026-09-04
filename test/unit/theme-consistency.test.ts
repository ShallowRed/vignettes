import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkThemeConsistency } from '../../shared/theme/consistency'

describe('checkThemeConsistency', () => {
  it('reports ok when tokens and css match exactly', () => {
    const report = checkThemeConsistency({
      tokens: ['dsfr', 'minimal', 'brand'],
      cssFiles: ['dsfr', 'minimal', 'brand'],
    })
    expect(report.ok).toBe(true)
    expect(report.warnings).toEqual([])
    expect(report.missingCss).toEqual([])
    expect(report.missingTokens).toEqual([])
  })

  it('flags a tokens theme whose compiled css is missing (the 404 case)', () => {
    const report = checkThemeConsistency({
      tokens: ['dsfr', 'minimal'],
      cssFiles: ['dsfr'],
    })
    expect(report.ok).toBe(false)
    expect(report.missingCss).toEqual(['minimal'])
    expect(report.warnings[0]).toContain('minimal')
    expect(report.warnings[0]).toContain('missing stylesheet')
  })

  it('flags a css theme with no tokens entry (renders but "unknown" per deck)', () => {
    const report = checkThemeConsistency({
      tokens: ['dsfr'],
      cssFiles: ['dsfr', 'dsfr-alt'],
    })
    expect(report.missingTokens).toEqual(['dsfr-alt'])
    expect(report.warnings.some(w => w.includes('dsfr-alt') && w.includes('no tokens entry'))).toBe(true)
  })

  it('flags a source dir with no compiled css (build:themes not run)', () => {
    const report = checkThemeConsistency({
      tokens: ['dsfr'],
      cssFiles: ['dsfr'],
      sourceDirs: ['dsfr', 'newtheme'],
    })
    expect(report.warnings.some(w => w.includes('newtheme') && w.includes('build:themes'))).toBe(true)
  })

  it('ignores infrastructure source dirs (presets, shared)', () => {
    const report = checkThemeConsistency({
      tokens: ['dsfr'],
      cssFiles: ['dsfr'],
      sourceDirs: ['dsfr', 'presets', 'shared'],
    })
    expect(report.ok).toBe(true)
  })

  it('the repo has no drift between tokens, source dirs and compiled css', () => {
    const cssFiles = readdirSync('public/themes').filter(f => f.endsWith('.css')).map(f => f.replace(/\.css$/, ''))
    const sourceDirs = readdirSync('themes', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    const report = checkThemeConsistency({ cssFiles, sourceDirs })
    expect(report.warnings).toEqual([])
  })
})
