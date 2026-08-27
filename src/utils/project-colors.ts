// Project accent colors, stored as hex (matches the existing projects.yml data).
// The folder icon and picker tint from the raw value via inline styles, so any
// stored hex renders — the palette is just the set the picker offers.
export const PROJECT_COLORS = [
  '#2563eb', // blue
  '#0891b2', // cyan
  '#0d9488', // teal
  '#059669', // emerald
  '#65a30d', // lime
  '#d97706', // amber
  '#ea580c', // orange
  '#dc2626', // red
  '#db2777', // pink
  '#7c3aed', // violet
  '#4f46e5', // indigo
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
