/**
 * Code themes: the colors and sizes of the code blocks of a deck, chosen in the
 * frontmatter (`code: sombre`, or `code: { theme: sombre, string: '#FFD700' }`).
 *
 * Shiki colors each token with the deck's highlight theme and, alongside, with
 * ROLES_THEME, whose colors only name the role of the token (key, string…). A
 * transformer turns that color into a `code-<role>` class, and the deck
 * stylesheet colors each class from a CSS variable set by `codeThemeStyle`. A
 * deck without `code` keeps the colors of the highlight theme.
 */

export const CODE_ROLES = ['key', 'string', 'literal', 'keyword', 'function', 'comment', 'punctuation'] as const
export type CodeRole = typeof CODE_ROLES[number]

export interface CodeTheme {
  /** Block background. */
  background?: string
  /** Border of the block, as the CSS `border` shorthand. */
  border?: string
  /** Text that belongs to no role. */
  text?: string
  key?: string
  string?: string
  /** Numbers, booleans, null and constants. */
  literal?: string
  keyword?: string
  function?: string
  comment?: string
  punctuation?: string
  /** Weight of the keys (400, 600, 700). */
  keyWeight?: number | string
  /** Minimal font size of the code, in pixels of the slide. */
  size?: number | string
  /** Opacity of the lines outside the current zone of a JsonTour. */
  dim?: number | string
  /** Background and left bar of the current zone of a JsonTour. */
  activeBackground?: string
  activeBar?: string
}

export const CODE_THEMES: Record<string, CodeTheme> = {
  // The colors of shiki's github-dark on the dark code block of the theme.
  nuit: {
    background: 'var(--code-surface-dark)',
    text: '#E1E4E8',
    key: '#79B8FF',
    string: '#9ECBFF',
    literal: '#79B8FF',
    keyword: '#F97583',
    function: '#B392F0',
    comment: '#6A737D',
    punctuation: '#E1E4E8',
    keyWeight: 500,
    dim: 0.4,
    activeBackground: 'rgb(255 255 255 / 8%)',
    activeBar: 'var(--accent-on-contrast)',
  },
  // Neutral dark background and one hue per kind of value, readable in a shared screen.
  sombre: {
    background: '#161616',
    text: '#F5F5FE',
    key: '#F5F5FE',
    string: '#FFCA00',
    literal: '#6FE49D',
    keyword: '#FF8D7E',
    function: '#A1A1F8',
    comment: '#A6A6A6',
    punctuation: '#C1C1C1',
    keyWeight: 700,
    size: 13,
    dim: 0.72,
    activeBackground: 'rgb(255 255 255 / 12%)',
    activeBar: 'var(--accent-on-contrast)',
  },
  // Light block in the colors of the theme: its text intensities, its accent
  // and the text tones of its card palette. Keywords keep a red, which the
  // palette lacks.
  clair: {
    background: 'var(--code-surface)',
    border: '1px solid var(--border)',
    text: 'var(--on-surface-title)',
    key: 'var(--accent-strong)',
    string: 'var(--palette-green-text)',
    literal: 'var(--palette-purple-text)',
    keyword: '#C9191E',
    function: 'var(--palette-blue-text)',
    comment: 'var(--on-surface-mention)',
    punctuation: 'var(--on-surface-default)',
    keyWeight: 700,
    size: 13,
    dim: 0.7,
    activeBackground: 'var(--accent-soft)',
    activeBar: 'var(--accent-strong)',
  },
}

/** The frontmatter `code` value: a theme name, or theme properties with an optional base `theme`. */
export type CodeThemeOption = string | (CodeTheme & { theme?: string })

/** The theme a frontmatter value describes; undefined for no value or an unknown name. */
export function resolveCodeTheme(option: unknown): CodeTheme | undefined {
  if (typeof option === 'string')
    return CODE_THEMES[option]
  if (!option || typeof option !== 'object')
    return undefined
  const { theme, ...overrides } = option as CodeTheme & { theme?: unknown }
  const base = typeof theme === 'string' ? CODE_THEMES[theme] ?? {} : {}
  return { ...base, ...overrides }
}

const VARIABLES: Record<keyof CodeTheme, string> = {
  background: '--code-background',
  border: '--code-border',
  text: '--code-text',
  key: '--code-key',
  string: '--code-string',
  literal: '--code-literal',
  keyword: '--code-keyword',
  function: '--code-function',
  comment: '--code-comment',
  punctuation: '--code-punctuation',
  keyWeight: '--code-key-weight',
  size: '--code-size',
  dim: '--code-dim',
  activeBackground: '--code-active-background',
  activeBar: '--code-active-bar',
}

/** CSS variables for the deck root. Only safe values pass: a value cannot close the declaration. */
export function codeThemeStyle(option: unknown): Record<string, string> {
  const theme = resolveCodeTheme(option)
  const style: Record<string, string> = {}
  if (!theme)
    return style
  for (const [property, variable] of Object.entries(VARIABLES) as [keyof CodeTheme, string][]) {
    const value = theme[property]
    if (value === undefined || value === null || value === '')
      continue
    const text = String(value)
    if (/[;{}<>]/.test(text))
      continue
    style[variable] = property === 'size' && /^\d+(?:\.\d+)?$/.test(text) ? `${text}px` : text
  }
  return style
}

// The role colors of ROLES_THEME. Text outside every role keeps the foreground.
const ROLE_COLORS: Record<CodeRole, string> = {
  key: '#000001',
  string: '#000002',
  literal: '#000003',
  keyword: '#000004',
  function: '#000005',
  comment: '#000006',
  punctuation: '#000007',
}

const ROLE_SCOPES: Record<CodeRole, string[]> = {
  comment: ['comment', 'punctuation.definition.comment'],
  string: ['string', 'punctuation.definition.string'],
  key: ['support.type.property-name', 'punctuation.support.type.property-name', 'meta.object-literal.key', 'entity.name.tag.yaml', 'variable.other.property'],
  literal: ['constant.numeric', 'constant.language', 'constant.other', 'constant.character'],
  keyword: ['keyword', 'storage.type', 'storage.modifier'],
  function: ['entity.name.function', 'support.function'],
  punctuation: ['punctuation', 'meta.brace'],
}

/** Name under which ROLES_THEME is registered in the highlighter and keyed in `mdc.highlight.theme`. */
export const ROLES_THEME_KEY = 'roles'

/** A shiki theme whose colors encode the role of each token. */
export const ROLES_THEME = {
  name: 'vignettes-roles',
  type: 'dark' as const,
  colors: { 'editor.foreground': '#000000', 'editor.background': '#000000' },
  tokenColors: (Object.entries(ROLE_SCOPES) as [CodeRole, string[]][]).map(([role, scope]) => ({ scope, settings: { foreground: ROLE_COLORS[role] } })),
}

const ROLE_BY_COLOR = new Map(Object.entries(ROLE_COLORS).map(([role, color]) => [color, role as CodeRole]))

/** The role a ROLES_THEME color stands for. */
export function roleOfColor(color: string | undefined): CodeRole | undefined {
  return color ? ROLE_BY_COLOR.get(color.toLowerCase()) : undefined
}

interface HastSpan { properties: Record<string, unknown> }

/**
 * Shiki transformer: gives each token the `code-<role>` class of its ROLES_THEME
 * color, and removes the ROLES_THEME variables from the inline styles.
 */
export function codeRolesTransformer() {
  const variable = `--shiki-${ROLES_THEME_KEY}`
  return {
    name: 'vignettes:code-roles',
    pre(node: HastSpan) {
      if (typeof node.properties.style === 'string')
        node.properties.style = node.properties.style.split(';').filter(rule => !rule.startsWith(variable)).join(';') || undefined
    },
    span(node: HastSpan, _line: number, _col: number, _lineNode: unknown, token: { htmlStyle?: Record<string, string> }) {
      const styles = token.htmlStyle
      if (!styles || !(variable in styles))
        return
      const role = roleOfColor(styles[variable])
      const rest = Object.entries(styles).filter(([key]) => !key.startsWith(variable))
      node.properties.style = rest.map(([key, value]) => `${key}:${value}`).join(';') || undefined
      if (role) {
        const classes = node.properties.class
        node.properties.class = [classes, `code-${role}`].filter(Boolean).join(' ')
      }
    },
  }
}
