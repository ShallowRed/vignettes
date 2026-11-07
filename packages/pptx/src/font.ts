import PPTXEmbedFonts from 'pptx-embed-fonts'

/** A font file the writer embeds in the PowerPoint file, under the family the slides name. */
export interface PptxFont {
  family: string
  /** A TrueType, OpenType or WOFF file. */
  data: ArrayBuffer
}

type FontFormat = 'ttf' | 'otf' | 'woff'

/** The format of a font file, read from its first four bytes; none for another format, WOFF2 for instance. */
export function fontFormat(data: ArrayBuffer): FontFormat | undefined {
  const tag = data.byteLength >= 4 ? new DataView(data).getUint32(0) : 0
  if (tag === 0x00010000 || tag === 0x74727565) // 1.0 or 'true'
    return 'ttf'
  if (tag === 0x4F54544F) // 'OTTO'
    return 'otf'
  if (tag === 0x774F4646) // 'wOFF'
    return 'woff'
  return undefined
}

/** The file with `font` embedded, which PowerPoint shows on a computer that lacks the font; the file unchanged for a format the writer does not read. */
export async function embedFont(bytes: ArrayBuffer, font: PptxFont): Promise<ArrayBuffer> {
  const format = fontFormat(font.data)
  if (!format)
    return bytes
  const embedded = new PPTXEmbedFonts()
  await embedded.load(bytes)
  if (format === 'ttf')
    await embedded.addFontFromTTF(font.family, font.data)
  else if (format === 'otf')
    await embedded.addFontFromOTF(font.family, font.data)
  else
    await embedded.addFontFromWOFF(font.family, font.data)
  const saved = await embedded.save()
  return saved instanceof ArrayBuffer ? saved : new Uint8Array(saved).slice().buffer
}
