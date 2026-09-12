import type { Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/**
 * Writer look of the markdown pane, one palette per color mode. Markdown gets a
 * document feel (real heading sizes, styled emphasis, dimmed syntax marks)
 * rather than code-editor token colors.
 */

interface Palette {
  background: string
  text: string
  heading: string
  dimmed: string
  accent: string
  codeBackground: string
  activeLine: string
  selection: string
}

const LIGHT: Palette = {
  background: '#ffffff',
  text: '#1f2937',
  heading: '#111827',
  dimmed: '#9ca3af',
  accent: '#2563eb',
  codeBackground: '#f3f4f6',
  activeLine: '#f9fafb',
  selection: '#bfdbfe80',
}

const DARK: Palette = {
  background: '#18181b',
  text: '#d4d4d8',
  heading: '#fafafa',
  dimmed: '#71717a',
  accent: '#60a5fa',
  codeBackground: '#27272a',
  activeLine: '#1f1f23',
  selection: '#1d4ed880',
}

function markdownHighlight(palette: Palette): Extension {
  return syntaxHighlighting(HighlightStyle.define([
    { tag: tags.heading1, color: palette.heading, fontWeight: '700', fontSize: '1.5em' },
    { tag: tags.heading2, color: palette.heading, fontWeight: '700', fontSize: '1.25em' },
    { tag: tags.heading3, color: palette.heading, fontWeight: '700', fontSize: '1.1em' },
    { tag: [tags.heading4, tags.heading5, tags.heading6], color: palette.heading, fontWeight: '700' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: palette.accent },
    { tag: tags.url, color: palette.accent, textDecoration: 'underline' },
    { tag: tags.monospace, backgroundColor: palette.codeBackground, borderRadius: '3px' },
    { tag: tags.quote, color: palette.dimmed, fontStyle: 'italic' },
    { tag: tags.contentSeparator, color: palette.accent, fontWeight: '700' },
    // Syntax marks (#, *, >, ```) and frontmatter fences recede behind the prose.
    { tag: [tags.processingInstruction, tags.meta, tags.punctuation], color: palette.dimmed },
    { tag: tags.comment, color: palette.dimmed, fontStyle: 'italic' },
  ]))
}

function baseTheme(palette: Palette, dark: boolean): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '0.925rem',
      backgroundColor: palette.background,
      color: palette.text,
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
      lineHeight: '1.65',
    },
    '.cm-content': {
      caretColor: palette.heading,
      padding: '1rem 0.25rem',
    },
    '.cm-line': { padding: '0 1rem' },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: palette.heading,
      borderLeftWidth: '2px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-activeLine': { backgroundColor: palette.activeLine },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: palette.selection,
    },
    '.cm-gutters': {
      backgroundColor: palette.background,
      color: palette.dimmed,
      borderRight: 'none',
    },
    '.cm-activeLineGutter': { backgroundColor: palette.activeLine },
  }, { dark })
}

/** The full writer theme (chrome + markdown styling) for one color mode. */
export function editorTheme(mode: 'light' | 'dark'): Extension[] {
  const palette = mode === 'dark' ? DARK : LIGHT
  return [baseTheme(palette, mode === 'dark'), markdownHighlight(palette)]
}
