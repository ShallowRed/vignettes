// The cases of test/e2e/cli.e2e.ts, each with its own token so that the relay
// counts the requests of one case, and the account the token belongs to:
// `collaborator`, of the role viewer with an editor grant on the folder `cli`,
// or `owner`, which plays someone else on the same decks. Read by the seed
// script and by the test; loading it writes nothing.

export type CliAccount = 'owner' | 'collaborator'

export const CLI_CASES = {
  'create': 'collaborator',
  'check-error': 'collaborator',
  'dry-run': 'collaborator',
  'resume': 'collaborator',
  'digest-unchecked': 'collaborator',
  'upload-resume': 'collaborator',
  'same-image': 'collaborator',
  'force': 'collaborator',
  'conflict': 'collaborator',
  'live-session': 'collaborator',
  'identical': 'collaborator',
  'pull': 'collaborator',
  'owner': 'owner',
} as const satisfies Record<string, CliAccount>

export type CliCase = keyof typeof CLI_CASES

/** The folder of the decks the collaborator creates. */
export const CLI_FOLDER = 'cli'

/** The accounts of the seed, by their fixed id. */
export const CLI_ACCOUNTS: Record<CliAccount, { id: number, login: string, role: 'owner' | 'viewer' }> = {
  owner: { id: 920_000_001, login: 'cli-owner', role: 'owner' },
  collaborator: { id: 920_000_002, login: 'cli-collaborator', role: 'viewer' },
}

/** The file the seed writes the secrets in, beside the database. */
export const tokensFile = (database: string) => `${database}.cli-tokens.json`

/** What the seed writes in the file of the tokens, for each case. */
export interface SeededToken {
  account: CliAccount
  secret: string
}
