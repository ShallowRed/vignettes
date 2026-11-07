# @vignettes/pptx

Writes a deck as a PowerPoint file. The titles, the text, the lists, the tables, the code, the columns and the images become PowerPoint elements that stay editable. Each slide takes a layout of the master, Title, Section or Content, or the layout of its media placement, and writes its title in the title placeholder of that layout. The speaker notes become the notes of the slide.

```ts
import { writePptx } from '@vignettes/pptx'

const bytes = await writePptx({ slides, meta }, {
  resolveUrl: url => new URL(url, location.href).href,
  loadImage: async (url, { maxWidth }) => loadAsPng(url, maxWidth),
  transformText: frenchTypography,
  style: measuredStyle,
  font: { family: 'Quicksand', data: fontBytes },
})
```

`slides` and `meta` are the slides and the frontmatter a deck parser gives. The package runs in a browser and in Node, and reaches no resource itself: the host loads each image (`loadImage` returns a `data:` URL of a PNG, a JPEG or a GIF and its size, or nothing) and resolves each address.

`style` is the look of the deck as the host measured it on the rendered slides (`PptxStyle`): the size and the padding of a slide, the font, the colors of the text, the links, the code, the tables and the frames, the surface and the title of each role, and where the title, the body and the media of each slide sit. The body of a measured slide keeps its place in text boxes. Without `style`, the master is fixed: a white surface, dark text, the font of the deck's theme and the size of its slides, and the body goes in the body placeholder at an estimated place. `font` is the font file of the theme, a TrueType, OpenType or WOFF file: the slides name its family and the file embeds it, which PowerPoint shows on a computer that lacks the font. A component the writer writes natively is listed in `NATIVE_COMPONENTS`; any other component of the deck contract, a story or a web page becomes a frame with its label and a link to its page, and an image the host cannot load becomes a frame with its text alternative.
