// https://nuxt.com/docs/api/configuration/nuxt-config
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import themeWatcher from './plugins/theme-watcher.js'

export default defineNuxtConfig({
  compatibilityDate: '2024-11-27',

  srcDir: 'src/',

  modules: ['@nuxtjs/mdc'],

  css: ['~/assets/css/tailwind.css'],

  mdc: {
    headings: {
      anchorLinks: false,
    },
  },

  vite: {
    plugins: [tailwindcss(), themeWatcher()],
  },

  app: {
    head: {
      title: 'Nuxt Slides',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },

  // Enable static site generation
  nitro: {
    prerender: {
      // Crawl links to discover routes
      crawlLinks: true,
      // Add API routes that need to be prerendered
      routes: ['/api/presentations'],
    },
  },

  // Hook to discover and prerender all presentation routes
  hooks: {
    'nitro:config': async function (nitroConfig) {
      // Discover all presentation files
      const presentationsDir = join(process.cwd(), 'presentations')
      try {
        const files = await readdir(presentationsDir)
        const slugs = files
          .filter((file: string) => file.endsWith('.md'))
          .map((file: string) => file.replace('.md', ''))

        // Add presentation routes for prerendering
        const presentationRoutes = slugs.flatMap((slug: string) => [
          `/slides/${slug}`,
          `/api/presentations/${slug}`,
        ])

        nitroConfig.prerender = nitroConfig.prerender || {}
        nitroConfig.prerender.routes = nitroConfig.prerender.routes || []
        nitroConfig.prerender.routes.push(...presentationRoutes)
      }
      catch (error) {
        console.warn('Could not discover presentation routes for prerendering:', error)
      }
    },
  },
})
