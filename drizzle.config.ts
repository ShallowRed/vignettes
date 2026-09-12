import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './layers/studio/server/db/schema.ts',
  out: './layers/studio/server/db/migrations',
})
