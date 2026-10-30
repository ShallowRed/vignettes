import type { AttributeMention, ComponentAttributeIssue, ComponentMention, LayoutMention, LegacyMention, MalformedAttributes, OpenBlock } from '@vignettes/core/deck'
import type { Translate } from '../config/editor-reference'
import type { LineProblem, ProblemFix, Severity } from './editor-problems'
import { inLanguage, LEGACY_FORMS, legacyMentions } from '@vignettes/core/deck'
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
  malformed: readonly MalformedAttributes[]
  componentAttributes: readonly ComponentAttributeIssue[]
  unclosed: readonly OpenBlock[]
  /** The frontmatter guide marks these in the source pane already. */
  frontmatter: readonly (LineProblem & { short: string })[]
  unknown: readonly ComponentMention[]
  refused: readonly AttributeMention[]
  layout: readonly LayoutMention[]
  legacy: readonly LegacyMention[]
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

// An error breaks or drops content, a warning changes what the author probably
// meant, an info asks for a cleanup without effect on the slide.
const LAYOUT_SEVERITIES: Record<LayoutMention['kind'], Severity> = {
  'unknown-attribute': 'warning',
  'invalid-value': 'warning',
  'missing-source': 'error',
  'unused': 'info',
  'behind-needs-image': 'error',
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
    ...findings.malformed.map(mention => ({
      ...mention,
      short: t('editor.diagnostics.malformedAttributesShort', { line: mention.line, name: mention.name }),
      message: t(`editor.diagnostics.malformedAttributes.${mention.reason}`, { name: mention.name }),
      severity: 'error' as const,
      marked: false,
    })),
    ...findings.componentAttributes.map(issue => ({
      ...issue,
      short: t(`editor.diagnostics.${COMPONENT_ATTRIBUTE_MESSAGES[issue.kind]}Short`, { line: issue.line, name: issue.name }),
      message: t(`editor.diagnostics.${COMPONENT_ATTRIBUTE_MESSAGES[issue.kind]}`, { name: issue.name, component: issue.component }),
      severity: 'warning' as const,
      marked: false,
    })),
    ...findings.unclosed.map(block => ({
      ...block,
      short: t('editor.diagnostics.unclosedBlockShort', { line: block.line, name: block.name, colons: block.colons }),
      message: t('editor.diagnostics.unclosedBlock', { name: block.name, colons: block.colons }),
      severity: 'error' as const,
      marked: false,
    })),
    ...findings.frontmatter.map(problem => ({ ...problem, marked: true })),
    // A directive whose attributes cannot be read shows as unknown too: one message is enough.
    ...findings.unknown.filter(mention => !findings.malformed.some(bad => bad.line === mention.line && bad.name === mention.name)).map(mention => ({
      ...mention,
      short: t('editor.diagnostics.unknownComponentShort', { line: mention.line, name: mention.name }),
      message: t('editor.diagnostics.unknownComponent', { name: mention.name }),
      docs: docsUrl(DOCS_SECTIONS.unknownComponent),
      severity: 'error' as const,
      marked: false,
    })),
    ...findings.refused.map(mention => ({
      ...mention,
      short: t(ATTRIBUTE_MESSAGES[mention.reason].short, { line: mention.line, name: mention.name }),
      message: t(ATTRIBUTE_MESSAGES[mention.reason].message),
      docs: docsUrl(DOCS_SECTIONS.refusedAttribute),
      severity: 'error' as const,
      marked: false,
    })),
    ...findings.layout.map(mention => ({
      ...mention,
      short: t(`${LAYOUT_MESSAGES[mention.kind]}Short`, { line: mention.line, name: mention.attribute }),
      message: t(LAYOUT_MESSAGES[mention.kind], { name: mention.attribute }),
      docs: docsUrl(DOCS_SECTIONS.layout),
      severity: LAYOUT_SEVERITIES[mention.kind],
      marked: false,
    })),
    ...findings.legacy.map((mention) => {
      const form = LEGACY_FORMS[mention.form]
      return {
        ...mention,
        short: t('editor.diagnostics.legacyShort', { line: mention.line, name: form.written }),
        message: inLanguage(form.description, lang),
        fix: legacyFix(mention, t),
        severity: 'info' as const,
        marked: false,
      }
    }),
  ]
  return issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line || a.column - b.column)
}
