import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processPostCatalogTx } from '../../src/indexer/handlers.js'
import { buildProfileClaim, buildPostInline, buildPostStart } from '../../src/protocol/encoder.js'
import { bytesToHex, generatePostId } from '../../src/protocol/utils.js'
import { POST_CATALOG_ADDRESS } from '../../src/protocol/constants.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function tx(payload, from, to = POST_CATALOG_ADDRESS, blockHeight = 100, txIndex = 0) {
  return {
    hash: Math.random().toString(36),
    from,
    to,
    data: bytesToHex(payload),
    blockHeight,
    transactionIndex: txIndex,
    timestamp: 0,
  }
}

describe('processPostCatalogTx', () => {
  it('indexes PROFILE_CLAIM into profile_claims and catalog_refs', async () => {
    await processPostCatalogTx(tx(buildProfileClaim('alice', 'Alice A'), 'NQ01 SENDER'))
    const row = await db.profile_claims.get(['alice', 'NQ01 SENDER'])
    expect(row?.display_name).toBe('Alice A')
    const refs = await db.catalog_refs.where('type').equals('PROFILE_CLAIM').toArray()
    expect(refs).toHaveLength(1)
    const user = await db.users.get('NQ01 SENDER')
    expect(user?.username).toBe('alice')
  })

  it('ignores PROFILE_CLAIM not sent to post catalog', async () => {
    await processPostCatalogTx(tx(buildProfileClaim('alice', 'Alice A'), 'NQ01 SENDER', 'NQ02 OTHER'))
    const n = await db.profile_claims.count()
    expect(n).toBe(0)
  })

  it('indexes POST_INLINE as inline post', async () => {
    const id = generatePostId()
    await processPostCatalogTx(tx(buildPostInline(id, 'hello'), 'NQ01 USER'))
    const posts = await db.posts.toArray()
    expect(posts).toHaveLength(1)
    expect(posts[0].status).toBe('inline')
    expect(posts[0].content).toBe('hello')
  })

  it('indexes POST_START as pending post', async () => {
    const postIdBuf = generatePostId()
    const hash8 = new Uint8Array(8).fill(1)
    const payload = buildPostStart(postIdBuf, 2, false, hash8)
    await processPostCatalogTx(tx(payload, 'NQ01 USER'))
    const posts = await db.posts.where('author').equals('NQ01 USER').toArray()
    expect(posts).toHaveLength(1)
    expect(posts[0].status).toBe('pending')
    expect(posts[0].total_chunks).toBe(2)
  })
})
