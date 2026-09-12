import type { Project } from './schema'

/** `ProjectDirectory` port: the catalog's grouping axis (db and yaml adapters). */
export interface ProjectDirectory {
  /** Ordered for display (order ascending, then title). */
  list: () => Promise<Project[]>
  resolve: (slug: string) => Promise<Project | null>
}
