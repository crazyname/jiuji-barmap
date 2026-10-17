// SPDX-License-Identifier: MPL-2.0
// PR-03 only: storage boundary. No verified user session exists in the product yet.
import Taro from '@tarojs/taro'
import { createJournalRepository, JOURNAL_STORAGE_PREFIX, JournalError } from '../../../../packages/core/src/journal'
import type { JournalStorage, PrivateJournalRepository } from '../../../../packages/core/src/journal-contracts'

/** Dedicated private namespace: never touches bars, recipes, posts, favorites or drafts. */
export function createWeChatJournalStorage(): JournalStorage {
  function checkKey(key: string): void {
    if (!key.startsWith(JOURNAL_STORAGE_PREFIX)) {
      throw new JournalError('STORAGE_INVALID', 'Unexpected journal storage key')
    }
  }
  return {
    read(key) {
      checkKey(key)
      return Taro.getStorageSync(key) as unknown
    },
    write(key, snapshot) {
      checkKey(key)
      // Fail loudly; no silent loss of local private records on quota/storage errors.
      Taro.setStorageSync(key, snapshot)
    }
  }
}

/** Fail-closed until a separate, real WeChat/server authentication PR is verified. */
export function createLockedWeChatJournalRepository(): PrivateJournalRepository {
  return createJournalRepository({
    storage: createWeChatJournalStorage(),
    identity: () => null,
    // These must not execute without an authenticated principal.
    newId: () => { throw new JournalError('AUTH_REQUIRED', 'User login has not been implemented') },
    now: () => new Date().toISOString()
  })
}
