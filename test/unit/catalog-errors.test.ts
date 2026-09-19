import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', (handler: any) => handler)

const listVisiblePresentations = vi.fn()
const listVisibleProjects = vi.fn()
vi.mock('../../layers/studio/server/utils/catalog', () => ({
  listVisiblePresentations: (...args: unknown[]) => listVisiblePresentations(...args),
  listVisibleProjects: (...args: unknown[]) => listVisibleProjects(...args),
}))

const { default: presentationsRoute } = await import('../../layers/studio/server/api/presentations.get')
const { default: projectsRoute } = await import('../../layers/studio/server/api/projects.get')

describe('the catalog endpoints', () => {
  it('answer the listing they are given', async () => {
    listVisiblePresentations.mockResolvedValue([{ slug: 'deck' }])
    listVisibleProjects.mockResolvedValue([{ slug: 'client' }])
    await expect(presentationsRoute({} as any)).resolves.toEqual([{ slug: 'deck' }])
    await expect(projectsRoute({} as any)).resolves.toEqual([{ slug: 'client' }])
  })

  it('let a failed read reach the caller instead of answering an empty list', async () => {
    listVisiblePresentations.mockRejectedValue(new Error('database is locked'))
    listVisibleProjects.mockRejectedValue(new Error('database is locked'))
    await expect(presentationsRoute({} as any)).rejects.toThrow('database is locked')
    await expect(projectsRoute({} as any)).rejects.toThrow('database is locked')
  })
})
