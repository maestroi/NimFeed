import { inject, provide } from 'vue'
import { IndexerService } from './IndexerService.js'

const INDEXER_KEY = Symbol('nimfeed-indexer')

/**
 * @param {import('../chain/rpc.js').NimiqRPC} rpc
 */
export function provideIndexer(rpc) {
  const indexer = new IndexerService(rpc)
  provide(INDEXER_KEY, indexer)
  return indexer
}

export function useIndexer() {
  const indexer = inject(INDEXER_KEY)
  if (!indexer) {
    throw new Error('provideIndexer(rpc) must be called from a parent component')
  }

  return {
    indexer,
    syncing: { value: false },
    async syncCatalog() {
      return indexer.syncPostCatalog()
    },
    async syncPostCatalog() {
      return indexer.syncPostCatalog()
    },
    async syncFollowCatalog() {
      return indexer.syncFollowCatalog()
    },
    async startDeltaSync() {
      return indexer.startDeltaSync()
    },
    /** @deprecated */
    syncUser(_address, _opts) {
      return indexer.syncUser(_address, _opts)
    },
  }
}
