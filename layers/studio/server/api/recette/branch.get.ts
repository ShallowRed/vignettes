import type { BranchRecetteAnswer } from '#shared/recette/branch'
import process from 'node:process'
import { assertRecette } from '../../utils/recette'
import { branchRecetteCaptures, currentBranch, readBranchRecette, worktreeState } from '../../utils/recette-branch'

/**
 * GET /api/recette/branch: the branch, its recette with the captures of its
 * questions, and the state of the worktree, which the capture run compares
 * before and after it. Development only: staging opens the kit, never the
 * working tree.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await assertRecette(event)
  const root = process.cwd()
  const state = await worktreeState(root)
  const files = await branchRecetteCaptures(useStorage('recette-captures'), await readBranchRecette(root), state)
  return { branch: await currentBranch(root), files, state } satisfies BranchRecetteAnswer
})
