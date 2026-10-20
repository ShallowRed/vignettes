import { useDatabase } from '../utils/db'

/**
 * Apply pending migrations at boot. The data migrations follow, once the schema
 * is current. Nitro calls a plugin without awaiting it, so the migration runs
 * synchronously: a failure throws here and stops the start.
 */
export default defineNitroPlugin(() => {
  useDatabase().migrateNow()
})
