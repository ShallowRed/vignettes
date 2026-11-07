import type { AttributeMention, ComponentAttributeIssue, ComponentMention, DeckProblem, LayoutMention, LegacyMention } from '@vignettes/core/deck'
import type { Translate } from '../config/editor-reference'
import type { LineProblem, ProblemFix, Severity } from './editor-problems'
import type { RenderFailureMention } from './render-failures'
import { deckComponentNamed, inLanguage, LEGACY_FORMS, legacyMentions } from '@vignettes/core/deck'
import { DOCS_SECTIONS } from '../config/editor-reference'

/**
 * The problems the editor lists under the preview, from what the parse of the
 * preview and the frontmatter guide find: each with its message, its short
 * text and its severity, the most severe first.
 */

export interface PreviewFindings {
  /** The first slide whose content reaches below it, placed on its first line. */
  overflow: { line: number, slide: number } | null
  brokenImages: readonly { src: string, line: number, column: number, length: number }[]
  /** The frontmatter guide marks these in the source pane already. */
  frontmatter: readonly (LineProblem & { short: string })[]
  unknown: readonly ComponentMention[]
  /** What `checkDeck` finds in the text. */
  deck: readonly DeckProblem[]
  /** The components that threw while the preview rendered them. */
  rendering: readonly RenderFailureMention[]
}

export interface EditorIssue extends LineProblem {
  short: string
  /** The source pane marks it already. */
  marked: boolean
}

const ATTRIBUTE_MESSAGES: Record<AttributeMention['reason'], { short: string, message: string }> = {
  url: { short: 'editor.diagnostics.refusedUrlShort', message: 'editor.diagnostics.refusedUrl' },
  binding: { short: 'editor.diagnostics.refusedBindingShort', message: 'editor.diagnostics.refusedBinding' },
  http: { short: 'editor.diagnostics.refusedEmbedShort', message: 'editor.diagnostics.refusedEmbed' },
}

const COMPONENT_ATTRIBUTE_MESSAGES: Record<ComponentAttributeIssue['kind'], string> = {
  'unknown': 'attributeUnknown',
  'false-text': 'attributeFalseText',
}

const LAYOUT_MESSAGES: Record<LayoutMention['kind'], string> = {
  'unknown-attribute': 'editor.diagnostics.layoutUnknownAttribute',
  'invalid-value': 'editor.diagnostics.layoutInvalidValue',
  'missing-source': 'editor.diagnostics.layoutMissingSource',
  'unused': 'editor.diagnostics.layoutUnused',
  'behind-needs-image': 'editor.diagnostics.layoutBehindNeedsImage',
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/** The conversion of the legacy form written on the line of `from`, read from the text as it stands. */
function legacyFix(mention: LegacyMention, t: Translate): ProblemFix | undefined {
  if (!mention.changes.length)
    return undefined
  return {
    label: t('editor.convert'),
    change: (state, from) => {
      const line = state.doc.lineAt(from).number
      const current = legacyMentions(state.doc.toString()).find(found => found.form === mention.form && found.line === line)
      return current?.changes.length ? { changes: current.changes } : undefined
    },
  }
}

/** The place, the texts and the conversion of a problem that `checkDeck` finds. */
function deckIssue(problem: DeckProblem, t: Translate, lang: string, docsUrl: (docs?: string) => string | undefined): Omit<EditorIssue, 'severity' | 'marked'> {
  const place = { line: problem.line, column: problem.column, length: problem.length }
  switch (problem.check) {
    case 'malformed':
      return {
        ...place,
        short: t('editor.diagnostics.malformedAttributesShort', { line: problem.line, name: problem.name }),
        message: t(`editor.diagnostics.malformedAttributes.${problem.reason}`, { name: problem.name }),
      }
    case 'component-attribute':
      return {
        ...place,
        short: t(`editor.diagnostics.${COMPONENT_ATTRIBUTE_MESSAGES[problem.kind]}Short`, { line: problem.line, name: problem.name }),
        message: t(`editor.diagnostics.${COMPONENT_ATTRIBUTE_MESSAGES[problem.kind]}`, { name: problem.name, component: problem.component }),
      }
    case 'unclosed':
      return {
        ...place,
        short: t('editor.diagnostics.unclosedBlockShort', { line: problem.line, name: problem.name, colons: problem.colons }),
        message: t('editor.diagnostics.unclosedBlock', { name: problem.name, colons: problem.colons }),
      }
    case 'refused':
      return {
        ...place,
        short: t(ATTRIBUTE_MESSAGES[problem.reason].short, { line: problem.line, name: problem.name }),
        message: t(ATTRIBUTE_MESSAGES[problem.reason].message),
        docs: docsUrl(DOCS_SECTIONS.refusedAttribute),
      }
    case 'layout':
      return {
        ...place,
        short: t(`${LAYOUT_MESSAGES[problem.kind]}Short`, { line: problem.line, name: problem.attribute }),
        message: t(LAYOUT_MESSAGES[problem.kind], { name: problem.attribute }),
        docs: docsUrl(DOCS_SECTIONS.layout),
      }
    case 'legacy': {
      const form = LEGACY_FORMS[problem.form]
      return {
        ...place,
        short: t('editor.diagnostics.legacyShort', { line: problem.line, name: form.written }),
        message: inLanguage(form.description, lang),
        fix: legacyFix(problem, t),
      }
    }
  }
}

export function editorIssues(raw: string, findings: PreviewFindings, t: Translate, lang: string, docsUrl: (docs?: string) => string | undefined): EditorIssue[] {
  const { overflow } = findings
  const issues: EditorIssue[] = [
    ...(overflow
      ? [{
          line: overflow.line,
          column: 0,
          length: raw.split('\n')[overflow.line - 1]?.length ?? 0,
          short: t('editor.diagnostics.overflowShort', { slide: overflow.slide }),
          message: t('editor.diagnostics.overflow', { slide: overflow.slide }),
          severity: 'warning' as const,
          marked: false,
        }]
      : []),
    ...findings.brokenImages.map(image => ({
      line: image.line,
      column: image.column,
      length: image.length,
      short: t('editor.diagnostics.imageMissingShort', { line: image.line }),
      message: t('editor.diagnostics.imageMissing', { src: image.src }),
      severity: 'error' as const,
      marked: false,
    })),
    ...findings.frontmatter.map(problem => ({ ...problem, marked: true })),
    // A directive whose attributes cannot be read shows as unknown too: one message is enough.
    ...findings.unknown.filter(mention => !findings.deck.some(bad => bad.check === 'malformed' && bad.line === mention.line && bad.name === mention.name)).map(mention => ({
      ...mention,
      short: t('editor.diagnostics.unknownComponentShort', { line: mention.line, name: mention.name }),
      message: t('editor.diagnostics.unknownComponent', { name: mention.name }),
      docs: docsUrl(DOCS_SECTIONS.unknownComponent),
      severity: 'error' as const,
      marked: false,
    })),
    ...findings.deck.map(problem => ({ ...deckIssue(problem, t, lang, docsUrl), severity: problem.severity, marked: false })),
    ...findings.rendering.map(failure => ({
      line: failure.line,
      column: failure.column,
      length: failure.length,
      short: t('editor.diagnostics.renderFailedShort', { line: failure.line, name: failure.name }),
      message: t('editor.diagnostics.renderFailed', { name: failure.name }),
      docs: docsUrl(deckComponentNamed(failure.name)?.docs ?? DOCS_SECTIONS.components),
      severity: 'error' as const,
      marked: false,
    })),
  ]
  return issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line || a.column - b.column)
}
