import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processPostCatalogTx } from '../../src/indexer/handlers.js'
import { putPost } from '../../src/db/queries.js'
import { buildProfileClaim, buildPostInline, buildPostStart } from '../../src/protocol/encoder.js'
import { bytesToHex, generatePostId, postIdToHex, hexToPostIdBytes } from '../../src/protocol/utils.js'
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

  it('reconciles username winner when older claim arrives later', async () => {
    await processPostCatalogTx(tx(buildProfileClaim('alice', 'Second'), 'NQ02 SECOND', POST_CATALOG_ADDRESS, 100, 0))
    let second = await db.users.get('NQ02 SECOND')
    expect(second?.username).toBe('alice')

    await processPostCatalogTx(tx(buildProfileClaim('alice', 'First'), 'NQ01 FIRST', POST_CATALOG_ADDRESS, 90, 0))

    const first = await db.users.get('NQ01 FIRST')
    second = await db.users.get('NQ02 SECOND')
    expect(first?.username).toBe('alice')
    expect(second?.username ?? null).toBeNull()
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

  it('resolves reply_to_author for a compact-reply POST_START when the target is already indexed', async () => {
    const targetId = generatePostId()
    const targetIdHex = postIdToHex(targetId)
    await putPost({
      author: 'NQ01 TARGET',
      post_id: targetIdHex,
      block_height: 50,
      tx_index: 0,
      content: 'original post',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'inline',
      first_seen_at: 50,
    })

    const replyId = generatePostId()
    const hash8 = new Uint8Array(8).fill(1)
    const payload = buildPostStart(replyId, 1, false, hash8, { replyPostId: hexToPostIdBytes(targetIdHex) })
    await processPostCatalogTx(tx(payload, 'NQ02 REPLIER', POST_CATALOG_ADDRESS, 60, 0))

    const reply = await db.posts.get(['NQ02 REPLIER', postIdToHex(replyId)])
    expect(reply.is_reply).toBe(true)
    expect(reply.reply_to_author).toBe('NQ01 TARGET')
    expect(reply.reply_to_post_id).toBe(targetIdHex)
  })

  it('leaves reply_to_author null for a compact-reply POST_START when the target is not yet indexed', async () => {
    const targetIdHex = postIdToHex(generatePostId())
    const replyId = generatePostId()
    const hash8 = new Uint8Array(8).fill(1)
    const payload = buildPostStart(replyId, 1, false, hash8, { replyPostId: hexToPostIdBytes(targetIdHex) })
    await processPostCatalogTx(tx(payload, 'NQ02 REPLIER', POST_CATALOG_ADDRESS, 60, 0))

    const reply = await db.posts.get(['NQ02 REPLIER', postIdToHex(replyId)])
    expect(reply.is_reply).toBe(true)
    expect(reply.reply_to_author).toBeNull()
    expect(reply.reply_to_post_id).toBe(targetIdHex)
  })
})
