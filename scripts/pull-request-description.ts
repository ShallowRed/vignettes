/**
 * Checks the description of a pull request against the template for the type of its title.
 *  Usage: PR_TITLE="fix(editor): …" PR_BODY="$(gh pr view --json body --jq .body)" node scripts/pull-request-description.ts
 */

import process from 'node:process'
import { descriptionIssues } from './lib/pull-request-description.ts'

const issues = descriptionIssues(process.env.PR_TITLE ?? '', process.env.PR_BODY ?? '')
for (const issue of issues)
  console.error(issue)
if (issues.length > 0) {
  console.error('\nCONTRIBUTING.md, section “Pull requests”, describes the templates.')
  process.exit(1)
}
console.log('The description follows its template.')
