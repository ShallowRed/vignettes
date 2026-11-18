/**
 * The events the studio sends to Umami after an action succeeds. Each event
 * names an action on an object, in the past tense; `via` names the place of
 * the interface it starts from. A data property takes one of a fixed list of
 * values, so an event carries no text of a deck or of an account.
 *
 * An event keeps its name and the meaning of its data: a change that a series
 * read before it would misread adds another event (docs/architecture.md).
 */

import { BUILT_IN_COMPONENTS, DECK_ANNOTATIONS } from '@vignettes/core/deck'
import { PublicationStatusSchema } from '@vignettes/core/status'
import { z } from 'zod'
import { DeckGrantSchema } from '../access/roles'

/** The keys of `SLIDE_TEMPLATES`; a test compares them. */
export const SLIDE_TEMPLATE_KEYS = ['twoColumns', 'threeColumns', 'cover', 'section', 'keyPoints', 'comparison', 'mediaText', 'quote', 'fullScreenImage', 'storybookGallery'] as const
export type SlideTemplateKey = typeof SLIDE_TEMPLATE_KEYS[number]

/** The side panels of the editor. */
export const EDITOR_PANELS = ['help', 'symbols', 'history', 'outline', 'meta'] as const
export type EditorPanel = typeof EDITOR_PANELS[number]

/** The kinds of `HistoryEntry`; a type test compares them. */
export const HISTORY_ENTRY_KINDS = ['version', 'snapshot'] as const

/** A component registered at runtime, by an extension package or a tenant, is sent under this name. */
export const EXTENSION_COMPONENT = 'extension'

const COMPONENT_NAMES = [
  ...BUILT_IN_COMPONENTS.map(component => component.name),
  ...DECK_ANNOTATIONS.map(annotation => annotation.tag),
]

/** The name an inserted component or annotation is sent under. */
export function componentEventName(name: string): string {
  return COMPONENT_NAMES.includes(name) ? name : EXTENSION_COMPONENT
}

const ComponentNameSchema = z.enum([EXTENSION_COMPONENT, ...COMPONENT_NAMES])

const InsertedSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('slide'),
    template: z.enum([...SLIDE_TEMPLATE_KEYS, 'empty']),
    via: z.enum(['toolbar']),
  }).strict(),
  z.object({
    kind: z.literal('component'),
    name: ComponentNameSchema,
    via: z.enum(['toolbar', 'help']),
  }).strict(),
  z.object({
    kind: z.literal('image'),
    source: z.enum(['file', 'placeholder']),
    via: z.enum(['toolbar', 'drop', 'paste']),
  }).strict(),
])

const NoData = z.object({}).strict()

export const STUDIO_EVENTS = {
  'deck-created': z.discriminatedUnion('source', [
    z.object({ source: z.literal('template') }).strict(),
    z.object({ source: z.literal('file') }).strict(),
    z.object({ source: z.literal('duplicate'), mode: z.enum(['variant', 'edition']) }).strict(),
  ]),
  'project-created': NoData,
  'deck-published': NoData,
  'access-granted': z.object({
    scope: z.enum(['deck', 'project']),
    role: DeckGrantSchema,
    via: z.enum(['account', 'handle']),
  }).strict(),
  'deck-status-changed': z.object({ status: PublicationStatusSchema }).strict(),
  'snapshot-saved': z.object({ named: z.boolean(), via: z.enum(['shortcut', 'history']) }).strict(),
  'version-restored': z.object({ kind: z.enum(HISTORY_ENTRY_KINDS) }).strict(),
  'editor-inserted': InsertedSchema,
  'layout-applied': z.object({ via: z.enum(['placement', 'proposal']) }).strict(),
  'panel-opened': z.object({ panel: z.enum(EDITOR_PANELS) }).strict(),
  'deck-exported': z.object({ format: z.enum(['pdf', 'pptx']) }).strict(),
} as const

export type StudioEventName = keyof typeof STUDIO_EVENTS
export type StudioEventData<Name extends StudioEventName> = z.input<typeof STUDIO_EVENTS[Name]>

/** The data an event sends. */
export type EventData = Readonly<Record<string, string | boolean>>

/** The data of an event once its schema accepts them, or `undefined`. */
export function studioEventData<Name extends StudioEventName>(name: Name, data: StudioEventData<Name>): EventData | undefined {
  const parsed = STUDIO_EVENTS[name].safeParse(data)
  return parsed.success ? parsed.data as EventData : undefined
}
