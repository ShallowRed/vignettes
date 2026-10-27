import type { Extension } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/**
 * Look of the markdown pane, one palette per color mode. Every line has the
 * same height so the line numbers, the folds and the current slide line up;
 * headings stand out by weight, and MDC components by color.
 */

interface Palette {
  text: string
  heading: string
  dimmed: string
  accent: string
  codeBackground: string
  activeLine: string
  selection: string
  component: string
  value: string
  literal: string
  error: string
  warning: string
  tooltip: string
}

const LIGHT: Palette = {
  text: '#1f2937',
  heading: '#111827',
  dimmed: '#9ca3af',
  accent: '#2563eb',
  codeBackground: '#f3f4f6',
  activeLine: '#f3f4f6',
  selection: '#bfdbfe80',
  component: '#7c3aed',
  value: '#15803d',
  literal: '#c2410c',
  error: '#dc2626',
  warning: '#d97706',
  tooltip: '#ffffff',
}

const DARK: Palette = {
  text: '#d4d4d8',
  heading: '#fafafa',
  dimmed: '#71717a',
  accent: '#60a5fa',
  codeBackground: '#27272a',
  activeLine: '#ffffff0a',
  selection: '#1d4ed880',
  component: '#c4a7ff',
  value: '#9ad29a',
  literal: '#f0b37e',
  error: '#f87171',
  warning: '#fbbf24',
  tooltip: '#232327',
}

function markdownHighlight(palette: Palette): Extension {
  return syntaxHighlighting(HighlightStyle.define([
    { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: palette.heading, fontWeight: '700' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: palette.accent },
    { tag: tags.url, color: palette.accent, textDecoration: 'underline' },
    { tag: tags.monospace, backgroundColor: palette.codeBackground, borderRadius: '3px' },
    { tag: tags.quote, color: palette.dimmed, fontStyle: 'italic' },
    { tag: tags.contentSeparator, color: palette.dimmed },
    // Syntax marks (#, *, >, ```) and frontmatter fences recede behind the prose.
    { tag: [tags.processingInstruction, tags.meta, tags.punctuation], color: palette.dimmed },
    { tag: tags.comment, color: palette.dimmed, fontStyle: 'italic' },
    // Code blocks, in the colors of the frontmatter: keys, strings, literals.
    { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: palette.accent },
    { tag: [tags.string, tags.special(tags.string)], color: palette.value },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: palette.literal },
    { tag: [tags.keyword, tags.definitionKeyword, tags.modifier, tags.controlKeyword], color: palette.component },
  ]))
}

function baseTheme(palette: Palette, dark: boolean): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'var(--ui-bg)',
      color: palette.text,
    },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
      lineHeight: '21px',
    },
    '.cm-content': {
      caretColor: palette.heading,
      padding: '8px 0 50vh',
    },
    '.cm-line': { padding: '0 16px 0 8px' },
    '.cm-lineWrapping .cm-line': { paddingInlineStart: 'calc(var(--hanging-indent, 0ch) + 8px)', textIndent: 'calc(-1 * var(--hanging-indent, 0ch))' },
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
      backgroundColor: 'var(--ui-bg)',
      color: palette.dimmed,
      borderRight: 'none',
      paddingTop: '0',
    },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '40px', padding: '0 4px 0 12px', opacity: '0.7' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    // The slide under the caret: a tint and a rule along its lines.
    // The current slide shows in the gutter only: a bar and accented numbers, so
    // the text keeps its contrast.
    '.cm-lineNumbers .cm-current-slide-gutter': { color: palette.accent, opacity: '1', boxShadow: `inset 3px 0 0 ${palette.accent}` },
    '.cm-foldGutter .cm-gutterElement': { width: '18px', display: 'grid', placeItems: 'center' },
    '.cm-fold-marker': { display: 'grid', placeItems: 'center', width: '16px', height: '16px', borderRadius: '4px', color: palette.dimmed, cursor: 'pointer', opacity: '0', transition: 'opacity 120ms' },
    '.cm-gutters:hover .cm-fold-marker, .cm-fold-marker--closed': { opacity: '1' },
    '.cm-fold-marker:hover': { color: palette.heading, backgroundColor: palette.activeLine },
    '.cm-fold-marker svg': { width: '14px', height: '14px' },
    '.cm-fold-marker--closed svg': { transform: 'rotate(-90deg)' },
    '.cm-slide-fold': { display: 'inline-flex', alignItems: 'baseline', gap: '8px', margin: '0 6px', padding: '0 8px', borderRadius: '4px', backgroundColor: palette.codeBackground, color: palette.dimmed, cursor: 'pointer', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '12px' },
    '.cm-slide-fold:hover': { color: palette.heading },
    '.cm-slide-fold__label': { color: palette.heading, fontWeight: '600' },
    '.cm-mdc-name': { color: palette.component },
    '.cm-mdc-attribute': { color: palette.text },
    '.cm-mdc-value': { color: palette.value },
    '.cm-mdc-close': { color: palette.component, opacity: '0.7' },
    '.cm-problem': { textDecoration: 'underline wavy', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
    '.cm-problem--error': { textDecorationColor: palette.error },
    '.cm-problem--warning': { textDecorationColor: palette.warning },
    '.cm-problem--info': { textDecorationColor: palette.dimmed },
    '.cm-hint': { marginLeft: '8px', color: palette.dimmed, fontStyle: 'italic', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '12px', cursor: 'pointer' },
    '.cm-hint:hover': { color: palette.text, textDecoration: 'underline' },
    '.cm-hint--text, .cm-hint--text:hover': { color: palette.dimmed, textDecoration: 'none', cursor: 'text' },
    '.cm-hint:has(.cm-hint__choice), .cm-hint:has(.cm-hint__choice):hover': { textDecoration: 'none', cursor: 'default' },
    '.cm-hint__choice': { cursor: 'pointer', marginRight: '12px' },
    '.cm-hint__choice:hover': { color: palette.text },
    '.cm-hint__key': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontStyle: 'normal', fontSize: '11px', padding: '0 4px', marginRight: '2px', border: `1px solid ${palette.dimmed}`, borderRadius: '4px' },
    '.cm-tooltip.cm-tooltip-hover, .cm-tooltip-autocomplete, .cm-completionInfo': { backgroundColor: palette.tooltip, color: palette.text, border: `1px solid ${palette.codeBackground}`, borderRadius: '6px', boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)' },
    '.cm-source-tooltip': { maxWidth: '320px', padding: '8px 10px', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '12.5px', lineHeight: '1.45' },
    '.cm-source-tooltip p': { margin: '2px 0 0' },
    '.cm-source-tooltip__key': { color: palette.accent, fontWeight: '600' },
    '.cm-source-tooltip__label': { color: palette.heading, fontWeight: '600' },
    '.cm-source-tooltip__link': { display: 'inline-block', marginTop: '4px', color: palette.accent, textDecoration: 'underline', textUnderlineOffset: '2px' },
    '.cm-source-tooltip__values': { color: palette.dimmed, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11.5px' },
    '.cm-source-tooltip__problem--error': { color: palette.error },
    '.cm-source-tooltip__problem--warning': { color: palette.warning },
    '.cm-completionInfo': { padding: '8px 10px', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '12.5px', maxWidth: '320px' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: palette.selection, color: palette.heading },
    '.cm-completionDetail': { color: palette.dimmed, fontStyle: 'normal', marginLeft: '12px' },
    '.cm-yaml-line, .cm-yaml-line *': { fontWeight: '400', color: palette.text },
    '.cm-yaml-line .cm-yaml-key, .cm-yaml-line .cm-yaml-key *': { color: palette.accent },
    '.cm-yaml-line .cm-yaml-string, .cm-yaml-line .cm-yaml-string *': { color: palette.value },
    '.cm-yaml-line .cm-yaml-literal, .cm-yaml-line .cm-yaml-literal *': { color: palette.literal },
    '.cm-yaml-line .cm-yaml-comment, .cm-yaml-line .cm-yaml-comment *': { color: palette.dimmed, fontStyle: 'italic' },
  }, { dark })
}

/** The full writer theme (chrome + markdown styling) for one color mode. */
export function editorTheme(mode: 'light' | 'dark'): Extension[] {
  const palette = mode === 'dark' ? DARK : LIGHT
  return [baseTheme(palette, mode === 'dark'), markdownHighlight(palette)]
}
