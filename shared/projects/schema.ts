import { z } from 'zod'

// Schema for presentations/projects.yml (the catalog's grouping axis, slug →
// display meta). YAML I/O lives in server/utils/projects.ts.

export const ProjectMetaSchema = z
  .object({
    /** Defaults to the slug. */
    title: z.string().optional(),
    /** Ascending; unset sorts last. */
    order: z.coerce.number().optional(),
    color: z.string().optional(),
    /** Lucide icon name (bare); see PROJECT_ICONS for the offered set. */
    icon: z.string().optional(),
  })
  .catchall(z.unknown())

export type ProjectMeta = z.infer<typeof ProjectMetaSchema>

export const ProjectsFileSchema = z.record(z.string(), ProjectMetaSchema)
export type ProjectsFile = z.infer<typeof ProjectsFileSchema>

/** Folder icons offered by the picker (bare lucide names, `folder` = default). */
export const PROJECT_ICONS = [
  'folder',
  'briefcase',
  'building-2',
  'rocket',
  'graduation-cap',
  'heart-handshake',
  'flask-conical',
  'palette',
  'globe',
  'megaphone',
] as const

export interface Project extends ProjectMeta {
  slug: string
  /** Privileged only: number of project grants (folder master keys). */
  sharedCount?: number
}

/**
 * Derive a url-safe slug from a free-text project title: strip accents, lower,
 * keep `[a-z0-9-]`, collapse dashes. Returns `''` when nothing survives (the
 * caller falls back to a generated slug). Pure — unit-tested.
 */
export function slugifyProject(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Non-destructive: an invalid file yields an empty list, never throws into a
// request path. Sorted by order then title.
export function parseProjects(input: unknown): Project[] {
  const result = ProjectsFileSchema.safeParse(input ?? {})
  if (!result.success)
    return []

  return Object.entries(result.data)
    .map(([slug, meta]): Project => ({ slug, ...meta }))
    .sort((a, b) => {
      const ao = a.order ?? Number.POSITIVE_INFINITY
      const bo = b.order ?? Number.POSITIVE_INFINITY
      if (ao !== bo)
        return ao - bo
      return (a.title ?? a.slug).localeCompare(b.title ?? b.slug)
    })
}
