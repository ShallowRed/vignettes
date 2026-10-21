/**
 * Hash a password for a presentation's `accessPassword` frontmatter.
 *  Usage: pnpm hash-password "<password>"
 */

import process from 'node:process'
import { hashAccessPassword } from '../layers/studio/server/utils/password.ts'

const password = process.argv[2]
if (!password) {
  console.error('Error: Password is required')
  console.error('Usage: pnpm hash-password "<password>"')
  process.exit(1)
}

const hashed = await hashAccessPassword(password)
console.log('Password hash:')
console.log(hashed)
console.log('\nAdd this to your presentation frontmatter:')
console.log(`accessPassword: "${hashed}"`)
