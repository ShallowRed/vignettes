import process from 'node:process'
import { productionConfigProblem, serverConfig } from '../utils/config'

/** A production server stops at boot on a configuration that would lose files at its next restart. */
export default defineNitroPlugin(() => {
  if (import.meta.dev)
    return
  const problem = productionConfigProblem(serverConfig())
  if (problem) {
    console.error(`[config] the server stops: ${problem}`)
    process.exit(1)
  }
})
