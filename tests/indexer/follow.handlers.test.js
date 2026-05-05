import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processFollowCatalogTx } from '../../src/indexer/handlers.js'
import { buildFollow, buildUnfollow } from '../../src/protocol/encoder.js'
import { bytesToHex, nqToAddressBytes, addressBytesToNq } from '../../src/protocol/utils.js'
import { FOLLOW_CATALOG_ADDRESS } from '../../src/protocol/constants.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const FOLLOWER = 'NQ01 FOLLOWER0000000000000000000000'
const followeeBytes = nqToAddressBytes('NQ07 0000 0000 0000 0000 0000 0000 0000 0001')
const FOLLOWEE_NQ = addressBytesToNq(followeeBytes)

function followCatalogTx(payload, from, blockHeight = 100, txIndex = 0) {
  return {
    hash: Math.random().toString(36),
    from,
    to: FOLLOW_CATALOG_ADDRESS,
    data: bytesToHex(payload),
    blockHeight,
    transactionIndex: txIndex,
    timestamp: 0,
  }
}

describe('FOLLOW catalog', () => {
  it('stores active follow record', async () => {
    await processFollowCatalogTx(followCatalogTx(buildFollow(followeeBytes), FOLLOWER))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row).toBeTruthy()
    expect(row.active).toBe(true)
  })

  it('ignores follow not sent to follow catalog', async () => {
    await processFollowCatalogTx({
      hash: 'x',
      from: FOLLOWER,
      to: 'NQ02 OTHER0000000000000000000000',
      data: bytesToHex(buildFollow(followeeBytes)),
      blockHeight: 100,
      transactionIndex: 0,
      timestamp: 0,
    })
    const n = await db.follows.count()
    expect(n).toBe(0)
  })
})

describe('UNFOLLOW catalog', () => {
  it('sets active=false on existing follow', async () => {
    await processFollowCatalogTx(followCatalogTx(buildFollow(followeeBytes), FOLLOWER, 100, 0))
    await processFollowCatalogTx(followCatalogTx(buildUnfollow(followeeBytes), FOLLOWER, 101, 0))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row.active).toBe(false)
  })

  it('does not overwrite a newer FOLLOW with an older UNFOLLOW', async () => {
    await processFollowCatalogTx(followCatalogTx(buildFollow(followeeBytes), FOLLOWER, 200, 0))
    await processFollowCatalogTx(followCatalogTx(buildUnfollow(followeeBytes), FOLLOWER, 100, 0))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row.active).toBe(true)
  })
})
