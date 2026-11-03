import process from 'node:process'
import { storePendingRooms } from '../utils/collab'
import { closeDatabase, databaseReady } from '../utils/db'

/**
 * Applies the pending migrations at boot, the schema then the data. Nitro calls
 * a plugin without awaiting it, but awaits its `request` hook: every request
 * waits there until the migrations end. A migration that fails stops the
 * process. When the server stops, the collab rooms store their pending edits
 * before the database closes.
 */
export default defineNitroPlugin((nitroApp) => {
  const ready = databaseReady().catch((error) => {
    console.error('[database] a migration failed, the server stops:', error)
    process.exit(1)
  })
  nitroApp.hooks.hook('request', () => ready)
  nitroApp.hooks.hook('close', async () => {
    await storePendingRooms()
    await closeDatabase()
  })
})
