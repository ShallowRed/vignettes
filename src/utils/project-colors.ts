// Project accent colors, stored as hex (matches the existing projects.yml data).
// The folder icon and picker tint from the raw value via inline styles, so any
// stored hex renders — the palette is just the set the picker offers.
export const PROJECT_COLORS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#64748b', // slate
] as const

export type ProjectColor = (typeof PROJECT_COLORS)[number]

/** Inline style tinting an element by the project color, or none when unset. */
export function projectColorStyle(color?: string | null): Record<string, string> {
  return color ? { color } : {}
}

/** Inline style filling a swatch with the project color. */
export function projectSwatchStyle(color?: string | null): Record<string, string> {
  return color ? { backgroundColor: color } : {}
}
