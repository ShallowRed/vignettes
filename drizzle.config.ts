import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './layers/studio/server/db/sqlite/schema.ts',
  out: './layers/studio/server/db/sqlite/migrations',
})
