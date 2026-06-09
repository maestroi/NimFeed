import {
  POST_CATALOG_ADDRESS,
  FOLLOW_CATALOG_ADDRESS,
  SYNC_PAGE_SIZE,
  SYNC_TX_BUDGET_PER_TICK,
  SYNC_WALL_CLOCK_BUDGET_MS,
} from '../protocol/constants.js'
import { processPostCatalogTx, processFollowCatalogTx, processDerivedAddressTx } from './handlers.js'
import { getSyncState, putSyncState, reconcileUsernameOwnership } from '../db/queries.js'
import { addressBytesToNq, derivePostAddress, nqToAddressBytes } from '../protocol/address.js'
import { hexToPostIdBytes } from '../protocol/utils.js'
import { db } from '../db/schema.js'
import { isDebugLogsEnabled } from '../debug/logging.js'

function debug(step, data = {}) {
  if (!isDebugLogsEnabled()) return
  console.info(`[NimFeed debug][indexer] ${step}`, data)
}

function normalizeNq(addr) {
  return String(addr || '').replace(/\s+/g, '').toUpperCase()
}

export class IndexerService extends EventTarget {
  /**
   * @param {import('../chain/rpc.js').NimiqRPC} rpc
   */
  constructor(rpc) {
    super()
    this.rpc = rpc
    this._deltaInterval = null
  }

  async syncPostCatalog() {
    debug('syncPostCatalog:start')
    await this._syncScoped('post_catalog', POST_CATALOG_ADDRESS, processPostCatalogTx)
    debug('syncPostCatalog:done')
  }

  async syncFollowCatalog() {
    debug('syncFollowCatalog:start')
    await this._syncScoped('follow_catalog', FOLLOW_CATALOG_ADDRESS, processFollowCatalogTx)
    debug('syncFollowCatalog:done')
  }

  async syncDerivedAddress(derivedNq) {
    const scopeKey = `derived:${normalizeNq(derivedNq)}`
    debug('syncDerivedAddress:start', { derivedNq })
    await this._syncScoped(scopeKey, derivedNq, (tx) => processDerivedAddressTx(tx, derivedNq))
    debug('syncDerivedAddress:done', { derivedNq })
  }

  /** @deprecated use syncPostCatalog */
  async syncCatalog() {
    return this.syncPostCatalog()
  }

  /** @deprecated chunked posts use derived addresses */
  async syncUser(_address, _opts = {}) {
    return undefined
  }

  async startDeltaSync() {
    const t0 = performance.now()
    debug('startDeltaSync:start')
    await this.syncPostCatalog()
    await reconcileUsernameOwnership()
    await this.syncFollowCatalog()

    const pending = await db.posts.where('status').anyOf('pending', 'missing_chunks').toArray()
    const derivedTargets = new Set()
    for (const post of pending) {
      try {
        if (post.status === 'missing_chunks') {
          await db.posts.update([post.author, post.post_id], { status: 'pending' })
        }
        const authorBytes = nqToAddressBytes(post.author)
        const postIdBytes = hexToPostIdBytes(post.post_id)
        const derivedBytes = await derivePostAddress(authorBytes, postIdBytes)
        const derivedNq = addressBytesToNq(derivedBytes)
        if (post.status === 'missing_chunks') {
          await db.sync_state.delete(`derived:${normalizeNq(derivedNq)}`)
        }
        derivedTargets.add(derivedNq)
      } catch {
        /* ignore malformed post keys */
      }
    }

    for (const derivedNq of derivedTargets) {
      try {
        await this.syncDerivedAddress(derivedNq)
      } catch {
        /* ignore transient derived scope failures */
      }
    }

    debug('startDeltaSync:done', {
      pendingPosts: pending.length,
      derivedScopes: derivedTargets.size,
      ms: Math.round(performance.now() - t0),
    })
    this.dispatchEvent(new CustomEvent('catalog:updated'))
  }

  startDeltaSyncLoop(intervalMs = 60_000) {
    if (this._deltaInterval) return
    this._deltaInterval = setInterval(() => {
      this.startDeltaSync().catch(() => {})
    }, intervalMs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.startDeltaSync().catch(() => {})
    })
  }

  stopDeltaSyncLoop() {
    clearInterval(this._deltaInterval)
    this._deltaInterval = null
  }

  async _syncScoped(scopeKey, address, handler) {
    let state = await getSyncState(scopeKey)
    if (!state) {
      state = {
        scope_key: scopeKey,
        newest_seen_tx_hash: null,
        oldest_synced_cursor: null,
        fully_synced: false,
        last_synced_at: 0,
      }
    }

    const newPage = await this.rpc.getTransactionsByAddress(address, SYNC_PAGE_SIZE, null)
    debug('_syncScoped:newPage', { scopeKey, address, txs: newPage.length, newestSeenTxHash: state.newest_seen_tx_hash })
    if (newPage.length) {
      let processed = 0
      for (const tx of newPage) {
        if (tx.hash === state.newest_seen_tx_hash) break
        await handler(this.rpc.normalizeTransaction(tx))
        processed++
      }
      debug('_syncScoped:newPageProcessed', { scopeKey, processed })
      state.newest_seen_tx_hash = newPage[0].hash
      if (state.oldest_synced_cursor == null) {
        state.oldest_synced_cursor = newPage[newPage.length - 1].hash
      }
      state.last_synced_at = Date.now()
      await putSyncState(state)
      this.dispatchEvent(new CustomEvent('updated', { detail: { address } }))
    }

    if (!state.fully_synced) {
      debug('_syncScoped:backfillNeeded', { scopeKey, oldestCursor: state.oldest_synced_cursor })
      await this._backfill(scopeKey, address, handler, state)
    }
  }

  async _backfill(scopeKey, address, handler, state) {
    const start = Date.now()
    let processed = 0

    while (Date.now() - start < SYNC_WALL_CLOCK_BUDGET_MS) {
      const page = await this.rpc.getTransactionsByAddress(address, SYNC_PAGE_SIZE, state.oldest_synced_cursor)
      debug('_backfill:page', { scopeKey, txs: page.length, cursor: state.oldest_synced_cursor })
      if (!page.length) {
        state.fully_synced = true
        break
      }

      for (const tx of page) {
        await handler(this.rpc.normalizeTransaction(tx))
        if (++processed >= SYNC_TX_BUDGET_PER_TICK) {
          await new Promise((r) => setTimeout(r, 0))
          processed = 0
        }
      }

      state.oldest_synced_cursor = page[page.length - 1].hash
      await putSyncState(state)
      this.dispatchEvent(new CustomEvent('updated', { detail: { address } }))

      if (page.length < SYNC_PAGE_SIZE) {
        state.fully_synced = true
        break
      }
    }

    debug('_backfill:done', { scopeKey, fullySynced: state.fully_synced, ms: Date.now() - start })
    await putSyncState(state)
  }
}
