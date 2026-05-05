import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/schema.js'
import { postIdToHex } from '../../src/protocol/utils.js'

const mocks = vi.hoisted(() => ({
  processDerivedAddressTx: vi.fn(),
}))

vi.mock('../../src/indexer/handlers.js', () => ({
  processPostCatalogTx: vi.fn(),
  processFollowCatalogTx: vi.fn(),
  processDerivedAddressTx: mocks.processDerivedAddressTx,
}))

import { IndexerService } from '../../src/indexer/IndexerService.js'

describe('IndexerService.syncDerivedAddress', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    mocks.processDerivedAddressTx.mockReset().mockResolvedValue(undefined)
  })

  it('still processes new derived txs when scope is already fully synced', async () => {
    const derivedNq = 'NQ98 6X9 01MX JQ4G JPJL 5BYC F98L AA5B XAAN'
    const scopeKey = `derived:${derivedNq.replace(/\s+/g, '').toUpperCase()}`

    await db.sync_state.put({
      scope_key: scopeKey,
      newest_seen_tx_hash: 'old-hash',
      oldest_synced_cursor: 'old-hash',
      fully_synced: true,
      last_synced_at: 1,
    })

    const tx = {
      hash: 'new-hash',
      from: 'NQ01 SENDER',
      to: derivedNq,
      data: '4e460104',
      blockHeight: 100,
      transactionIndex: 0,
      timestamp: 0,
    }

    const rpc = {
      getTransactionsByAddress: vi.fn().mockResolvedValue([tx]),
      normalizeTransaction: (raw) => raw,
    }

    const svc = new IndexerService(rpc)
    await svc.syncDerivedAddress(derivedNq)

    expect(rpc.getTransactionsByAddress).toHaveBeenCalledWith(derivedNq, 500, null)
    expect(mocks.processDerivedAddressTx).toHaveBeenCalledTimes(1)
    expect(mocks.processDerivedAddressTx).toHaveBeenCalledWith(tx, derivedNq)

    const state = await db.sync_state.get(scopeKey)
    expect(state?.newest_seen_tx_hash).toBe('new-hash')
    expect(state?.fully_synced).toBe(true)
  })

  it('emits catalog:updated after pending derived syncs are awaited', async () => {
    await db.posts.put({
      author: 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD',
      post_id: postIdToHex(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
      tx_hash: 'start-tx',
      block_height: 50000000,
      tx_index: 0,
      content: null,
      total_chunks: 2,
      chunks_received: 1,
      compressed: false,
      content_hash: '0011223344556677',
      is_inline: false,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'pending',
      first_seen_at: 50000000,
    })

    const rpc = {
      getTransactionsByAddress: vi.fn().mockResolvedValue([]),
      normalizeTransaction: (raw) => raw,
    }

    const svc = new IndexerService(rpc)
    let resolveDerived
    const derivedWait = new Promise((resolve) => {
      resolveDerived = resolve
    })
    const derivedSpy = vi.spyOn(svc, 'syncDerivedAddress').mockImplementation(async () => {
      await derivedWait
    })

    let updated = false
    svc.addEventListener('catalog:updated', () => {
      updated = true
    })

    const run = svc.startDeltaSync()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(updated).toBe(false)
    expect(derivedSpy).toHaveBeenCalledTimes(1)

    resolveDerived()
    await run
    expect(updated).toBe(true)
  })
})
