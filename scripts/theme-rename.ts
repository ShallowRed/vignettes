/**
 * Rename the theme a deployed instance's decks declare, through its
 * `/api/content/theme-rename` route and the content token. A theme's name lives
 * in the frontmatter of every published version, draft and snapshot, and in the
 * `theme` column the catalog reads, so a rename by hand in the editor would
 * miss most of them. The instance rewrites them in one transaction, with the
 * rule of `server/utils/theme-rename.ts`.
 *
 * DRY-RUN BY DEFAULT: prints the decks it would rewrite. `--apply` writes.
 *
 *   node scripts/theme-rename.ts <from> <to>            # plan against prod
 *   node scripts/theme-rename.ts <from> <to> --apply    # write
 *   node scripts/theme-rename.ts <from> <to> --staging  # target staging
 *   node scripts/theme-rename.ts <from> <to> --deck=a,b  # only these decks
 */

import type { themeRenameSummary } from '../layers/studio/server/utils/theme-rename.ts'
import process from 'node:process'
import { callInstance, instanceFromEnv } from './lib/instance.ts'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const STAGING = args.includes('--staging')
const ONLY = args.find(a => a.startsWith('--deck='))?.slice(7).split(',').map(s => s.trim()).filter(Boolean)
const [FROM, TO] = args.filter(a => !a.startsWith('--'))
if (!FROM || !TO) {
  console.error('usage: theme-rename.ts <from> <to> [--deck=<slug>[,<slug>]] [--apply] [--staging]')
  process.exit(2)
}

const instance = instanceFromEnv(STAGING)

console.log(`cible   : ${instance.url}`)
console.log(`thème   : ${FROM} → ${TO}`)
console.log(`mode    : ${APPLY ? 'APPLY' : 'DRY-RUN (aucune écriture)'}\n`)

const decks = await callInstance<ReturnType<typeof themeRenameSummary>>(instance, '/api/content/theme-rename', { from: FROM, to: TO, decks: ONLY, apply: APPLY })
  .catch((error: Error) => {
    console.error(`✖ ${error.message}`)
    process.exit(1)
  })

for (const deck of decks) {
  const parts = [
    deck.column ? 'colonne' : null,
    deck.versions ? `${deck.versions} version(s) publiée(s)` : null,
    deck.snapshots ? `${deck.snapshots} instantané(s)` : null,
    deck.draft ? 'brouillon' : null,
  ].filter(Boolean)
  console.log(`  · ${deck.slug} : ${parts.join(', ')}`)
}
if (decks.length === 0)
  console.log(`  aucun deck ne déclare « ${FROM} »`)
else
  console.log(APPLY ? '\n✅ Renommé.' : '\nDry-run terminé. Relancer avec --apply pour écrire.')
