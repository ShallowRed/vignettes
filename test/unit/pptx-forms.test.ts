import { BUILT_IN_COMPONENTS, componentKey, deckComponents, inLanguage, registerDeckComponents, resetDeckComponents } from '@vignettes/core/deck'
import { NATIVE_COMPONENTS, writePptx } from '@vignettes/pptx'
import { SCHEMA_COMPONENTS } from '@vignettes/schemas/components'
import { STORYBOOK_COMPONENTS } from '@vignettes/storybook/components'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => resetDeckComponents())

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;')

describe('the components the PowerPoint writer writes natively', () => {
  it('names built-in components of the deck contract', () => {
    const builtIn = BUILT_IN_COMPONENTS.map(component => component.name)
    expect(NATIVE_COMPONENTS.filter(name => !builtIn.includes(name))).toEqual([])
  })

  it('writes any other registered component as a frame with its label', async () => {
    registerDeckComponents(SCHEMA_COMPONENTS)
    registerDeckComponents(STORYBOOK_COMPONENTS)
    const native = new Set(NATIVE_COMPONENTS.map(componentKey))
    const framed = deckComponents().filter(component => !component.parent && !native.has(componentKey(component.name)))
    expect(framed.length).toBeGreaterThan(0)
    for (const component of framed) {
      const body = { type: 'root', children: [{ type: 'element', tag: component.name, props: {}, children: [{ type: 'text', value: 'Contenu du composant' }] }] }
      const bytes = await writePptx({ meta: { lang: 'fr' }, slides: [{ headingLevel: 'h3', body }] }, { resolveUrl: url => url, loadImage: async () => undefined })
      const zip = await JSZip.loadAsync(bytes)
      const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
      expect(xml, component.name).toContain(`<a:t>${escapeXml(inLanguage(component.label, 'fr') || component.name)}</a:t>`)
      expect(xml, component.name).not.toContain('Contenu du composant')
    }
  })
})
