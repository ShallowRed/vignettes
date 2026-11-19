/**
 * The names of the captures of a branch recette, which the Playwright capture
 * run writes and the studio serves in development. Free of imports, so the
 * capture run loads it alone.
 */

const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*'

/** The form of a recette subject, the name of its file without `.yaml`, and of a question id. */
export const RECETTE_SUBJECT_RE = new RegExp(`^${NAME}$`)

/** The widths a question is captured at, each a project of `playwright.recette.config.ts`. */
export const RECETTE_WIDTHS = ['desktop', 'phone'] as const
export type RecetteWidth = typeof RECETTE_WIDTHS[number]

/** The window a question is captured in at each width, the window of `Desktop Chrome` and `Pixel 7` in Playwright. */
export const RECETTE_VIEWPORTS: Record<RecetteWidth, { width: number, height: number }> = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 412, height: 839 },
}

/** The directory of the recette files, from the root of the repository. */
export const RECETTE_DIR = 'test/recette'

/** The directory of the captures, from the root of the repository, which git ignores. */
export const RECETTE_CAPTURE_DIR = '.data/recette/captures'

/** The key of a capture, `<subject>/<id>-<width>.png`, under `RECETTE_CAPTURE_DIR`. */
export const CAPTURE_KEY_RE = new RegExp(`^${NAME}/${NAME}-(?:${RECETTE_WIDTHS.join('|')})\\.png$`)

export function captureKey(subject: string, id: string, width: RecetteWidth): string {
  return `${subject}/${id}-${width}.png`
}

/**
 * The key of the file that holds the state of the worktree a subject was
 * captured at and the keys of the captures that run took,
 * `{ "state": "<hash>", "keys": ["<subject>/<id>-<width>.png"] }`.
 */
export function captureStateKey(subject: string): string {
  return `${subject}/state.json`
}

/** The subject of `test/recette/<subject>.yaml`, or undefined for any other path. */
export function recetteSubject(path: string): string | undefined {
  const subject = path.startsWith(`${RECETTE_DIR}/`) ? /^([^/]+)\.yaml$/.exec(path.slice(RECETTE_DIR.length + 1))?.[1] : undefined
  return subject !== undefined && RECETTE_SUBJECT_RE.test(subject) ? subject : undefined
}
