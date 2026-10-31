import type { RouterConfig } from 'nuxt/schema'

// The server sorts the pages by their path, case included (`#shared/origins`):
// the router matches the same paths, so that `/Slides/<deck>` is no deck page.
export default {
  sensitive: true,
} satisfies RouterConfig
