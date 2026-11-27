import type { Keyring, KeyringLoader } from '../../../packages/cli/src/storage.ts'
import { expect } from 'vitest'

export type KeyringFailure = 'missing-module' | 'no-secret-service' | 'locked'

/**
 * A keyring in memory, or one that fails the way `failure` names; `lock` and
 * `unlock` change its state between a write and a read.
 */
export function fakeKeyring(failure?: KeyringFailure) {
  const passwords = new Map<string, string>()
  let locked = failure === 'locked'
  const load: KeyringLoader = async () => {
    if (failure === 'missing-module')
      throw Object.assign(new Error('Cannot find module'), { code: 'ERR_MODULE_NOT_FOUND' })
    return {
      Entry: class {
        service: string
        account: string

        constructor(service: string, account: string, options?: { linux?: { store?: string } }) {
          expect(options).toEqual({ linux: { store: 'secret-service' } })
          this.service = service
          this.account = account
          if (failure === 'no-secret-service')
            throw new Error('Platform secure storage failure')
        }

        getPassword() {
          if (locked)
            throw new Error('keychain locked')
          return passwords.get(`${this.service}/${this.account}`) ?? null
        }

        setPassword(password: string) {
          if (locked)
            throw new Error('keychain locked')
          passwords.set(`${this.service}/${this.account}`, password)
        }

        deletePassword() {
          if (locked)
            throw new Error('keychain locked')
          return passwords.delete(`${this.service}/${this.account}`)
        }
      },
    } satisfies Keyring
  }
  return {
    load,
    passwords,
    lock: () => {
      locked = true
    },
    unlock: () => {
      locked = false
    },
  }
}
