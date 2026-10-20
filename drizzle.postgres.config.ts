import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './layers/studio/server/db/postgres/schema.ts',
  out: './layers/studio/server/db/postgres/migrations',
})
