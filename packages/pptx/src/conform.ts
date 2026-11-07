import JSZip from 'jszip'

// The XML pptxgenjs writes, made to follow the PresentationML schema, which
// PowerPoint checks as it opens a file: Keynote and LibreOffice accept both.

const PARAGRAPH_RE = /<a:p>([\s\S]*?)<\/a:p>/g
const PARAGRAPH_PROPERTIES_RE = /<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g
const PARTS_RE = /^ppt\/(?:slides|slideLayouts|slideMasters|notesSlides|notesMasters)\/[^/]+\.xml$/

/**
 * A paragraph keeps the properties written before its first run: pptxgenjs
 * writes properties before each run of a paragraph, and the schema takes one
 * set, first.
 */
export function oneParagraphProperties(xml: string): string {
  return xml.replace(PARAGRAPH_RE, (_, inner: string) => {
    let first = true
    const kept = inner.replace(PARAGRAPH_PROPERTIES_RE, (properties: string, offset: number) => {
      const leading = first && !inner.slice(0, offset).trim()
      first = false
      return leading ? properties : ''
    })
    return `<a:p>${kept}</a:p>`
  })
}

/** The list of notes masters comes before the list of slides, as the schema orders them. */
export function notesMastersFirst(xml: string): string {
  const notes = /<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/.exec(xml)?.[0]
  const slides = xml.indexOf('<p:sldIdLst>')
  if (!notes || slides === -1 || xml.indexOf(notes) < slides)
    return xml
  const without = xml.replace(notes, '')
  const at = without.indexOf('<p:sldIdLst>')
  return `${without.slice(0, at)}${notes}${without.slice(at)}`
}

export async function conformPptx(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes)
  for (const path of Object.keys(zip.files).filter(path => PARTS_RE.test(path))) {
    const xml = await zip.file(path)!.async('string')
    const conform = oneParagraphProperties(xml)
    if (conform !== xml)
      zip.file(path, conform)
  }
  const presentation = await zip.file('ppt/presentation.xml')?.async('string')
  if (presentation)
    zip.file('ppt/presentation.xml', notesMastersFirst(presentation))
  return await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}
