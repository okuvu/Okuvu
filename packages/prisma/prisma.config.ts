import { defineConfig } from '@prisma/config'
import { config } from 'dotenv'

// This explicitly loads your .env file into process.env
config()

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  }
})