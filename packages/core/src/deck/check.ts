import type { LegacyMention } from './legacy-forms.ts'
import type { AttributeMention, ComponentAttributeIssue, LayoutMention, MalformedAttributes, OpenBlock } from './split.ts'
import { legacyMentions } from './legacy-forms.ts'
import { attributeMentions, componentAttributeIssues, layoutMentions, malformedAttributeMentions, unclosedBlocks } from './split.ts'

/**
 * An error breaks or drops content, a warning changes what the author probably
 * meant, an info asks for a cleanup without effect on the slide.
 */
export type DeckProblemSeverity = 'error' | 'warning' | 'info'

/** A problem of the text of a deck, by the check that finds it, placed on its line. */
export type DeckProblem
  = | (MalformedAttributes & { check: 'malformed', severity: DeckProblemSeverity })
    | (ComponentAttributeIssue & { check: 'component-attribute', severity: DeckProblemSeverity })
    | (OpenBlock & { check: 'unclosed', severity: DeckProblemSeverity })
    | (AttributeMention & { check: 'refused', severity: DeckProblemSeverity })
    | (LayoutMention & { check: 'layout', severity: DeckProblemSeverity })
    | (LegacyMention & { check: 'legacy', severity: DeckProblemSeverity })

const LAYOUT_SEVERITIES: Record<LayoutMention['kind'], DeckProblemSeverity> = {
  'unknown-attribute': 'warning',
  'invalid-value': 'warning',
  'missing-source': 'error',
  'unused': 'info',
  'behind-needs-image': 'error',
}

/**
 * The problems found in the text of a deck alone, in the order of the text.
 */
export function checkDeck(raw: string): DeckProblem[] {
  const problems: DeckProblem[] = [
    ...malformedAttributeMentions(raw).map(mention => ({ ...mention, check: 'malformed' as const, severity: 'error' as const })),
    ...componentAttributeIssues(raw).map(issue => ({ ...issue, check: 'component-attribute' as const, severity: 'warning' as const })),
    ...unclosedBlocks(raw).map(block => ({ ...block, check: 'unclosed' as const, severity: 'error' as const })),
    ...attributeMentions(raw).map(mention => ({ ...mention, check: 'refused' as const, severity: 'error' as const })),
    ...layoutMentions(raw).map(mention => ({ ...mention, check: 'layout' as const, severity: LAYOUT_SEVERITIES[mention.kind] })),
    ...legacyMentions(raw).map(mention => ({ ...mention, check: 'legacy' as const, severity: 'info' as const })),
  ]
  return problems.sort((a, b) => a.line - b.line || a.column - b.column)
}
