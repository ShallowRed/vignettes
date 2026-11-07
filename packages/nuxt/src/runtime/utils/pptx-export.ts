// The browser side of the PowerPoint export: the page loads this module on the
// first click of the command, with `@vignettes/pptx` and pptxgenjs.

import type { ThemePptx } from '@vignettes/core/theme'
import type { PptxFont, PptxImage } from '@vignettes/pptx'
import type { PresentationData } from '../types/presentation.ts'
import { slugify } from '@vignettes/core/slugify'
import { writePptx } from '@vignettes/pptx'
import { transformerTexte } from '@vignettes/typographie'
import { measurePptxStyle } from './pptx-style.ts'
import { saveFile } from './save-file.ts'

const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const KEPT_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * An image of the site keeps its bytes: the page may fetch its own origin
 * (`connect-src 'self'`). Another type, an SVG for instance, is drawn instead.
 */
async function sameSiteImage(url: string): Promise<PptxImage | undefined> {
  const response = await fetch(url)
  const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!response.ok || !KEPT_TYPES.has(type))
    return undefined
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return { data: await readAsDataUrl(blob), ...size }
}

// An image that answers neither way within this delay is left out, as one that fails.
const IMAGE_TIMEOUT_MS = 15_000

/** The image element once loaded, read in CORS mode; the load event, since `decode()` can wait forever on an image out of the page. */
function loadedImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => reject(new Error(`image timed out: ${url}`)), IMAGE_TIMEOUT_MS)
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`image failed: ${url}`))
    }
    image.src = url
  })
}

/**
 * An image drawn on a canvas, as a PNG at most `maxWidth` pixels wide. The page
 * shows any image (`img-src`), and reads the pixels of an image of another site
 * only when that site allows it (CORS): otherwise the canvas refuses them.
 */
async function drawnImage(url: string, maxWidth: number): Promise<PptxImage | undefined> {
  const image = await loadedImage(url)
  // An SVG without its own size takes the width of the slide, at 4:3.
  const naturalWidth = image.naturalWidth || maxWidth / 2
  const naturalHeight = image.naturalHeight || naturalWidth * 3 / 4
  const scale = Math.min(1, maxWidth / naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(naturalHeight * scale))
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
}

async function loadImage(url: string, { maxWidth }: { maxWidth: number }): Promise<PptxImage | undefined> {
  try {
    if (!url.startsWith('data:') && new URL(url).origin === window.location.origin) {
      const kept = await sameSiteImage(url)
      if (kept)
        return kept
    }
    return await drawnImage(url, maxWidth)
  }
  catch {
    return undefined
  }
}

/** The font file a theme names for the export; none when it fails to load, and the slides keep the family the deck renders in. */
async function loadFont(font: ThemePptx['font']): Promise<PptxFont | undefined> {
  if (!font)
    return undefined
  try {
    const response = await fetch(new URL(font.src, window.location.href))
    return response.ok ? { family: font.family, data: await response.arrayBuffer() } : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Writes the deck as a PowerPoint file in the look of its slides rendered in
 * `root`, with the font the theme embeds, and downloads it, named after its title.
 */
export async function exportPptx(deck: PresentationData, root: HTMLElement, options: { frenchTypography: boolean, font?: ThemePptx['font'] }): Promise<void> {
  const bytes = await writePptx({ slides: deck.slides, meta: deck.metadata }, {
    style: measurePptxStyle(root),
    font: await loadFont(options.font),
    resolveUrl: url => new URL(url, window.location.href).href,
    loadImage,
    transformText: options.frenchTypography ? transformerTexte : undefined,
  })
  const title = typeof deck.metadata.title === 'string' ? deck.metadata.title : ''
  saveFile(`${slugify(title, { lower: true, strict: true }) || 'presentation'}.pptx`, new Blob([bytes], { type: PPTX_TYPE }))
}
