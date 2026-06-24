import { defineConfig } from '@prisma/config'
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(__dirname, '../../.env') })

export default defineConfig({
  schema: resolve(__dirname, '../../packages/prisma/schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
