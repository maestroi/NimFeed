import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import {
  putUser,
  getUser,
  putPost,
  getPost,
  putCatalogRef,
  getCatalogRefs,
  putProfileClaim,
  getMostActiveUsers,
} from '../../src/db/queries.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('users store', () => {
  it('stores and retrieves a user', async () => {
    await putUser({ address: 'NQ01 TEST', display_name: 'Alice', username: 'alice' })
    const user = await getUser('NQ01 TEST')
    expect(user.display_name).toBe('Alice')
  })
})

describe('profile_claims store', () => {
  it('stores and retrieves a claim', async () => {
    await putProfileClaim({
      username: 'alice',
      address: 'NQ01A',
      display_name: 'Alice',
      block_height: 10,
      tx_index: 0,
      tx_hash: 'x',
    })
    const row = await db.profile_claims.get(['alice', 'NQ01A'])
    expect(row.display_name).toBe('Alice')
  })
})

describe('posts store', () => {
  it('stores inline post and retrieves by author', async () => {
    await putPost({
      author: 'NQ01A',
      post_id: '0000000000000001',
      block_height: 10,
      tx_index: 0,
      content: 'hello',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'inline',
      first_seen_at: 10,
    })
    const posts = await db.posts.where('author').equals('NQ01A').toArray()
    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBe('hello')
  })

  it('stores pending chunked post by compound key', async () => {
    await putPost({
      author: 'NQ01 TEST',
      post_id: '0000000100000001',
      block_height: 200,
      tx_index: 0,
      content: null,
      total_chunks: 2,
      chunks_received: 0,
      compressed: true,
      content_hash: 'aabbccdd00112233',
      is_inline: false,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'pending',
      first_seen_at: 200,
    })
    const post = await getPost('NQ01 TEST', '0000000100000001')
    expect(post.status).toBe('pending')
    expect(post.total_chunks).toBe(2)
  })

  it('ranks claimed users by completed post count', async () => {
    await Promise.all([
      putUser({ address: 'NQ01 ALICE', display_name: 'Alice', username: 'alice' }),
      putUser({ address: 'NQ02 BOB', display_name: 'Bob', username: 'bob' }),
      putUser({ address: 'NQ03 HIDDEN', display_name: 'Hidden', username: null }),
    ])

    await Promise.all([
      putPost({ author: 'NQ01 ALICE', post_id: '1', block_height: 10, status: 'inline' }),
      putPost({ author: 'NQ01 ALICE', post_id: '2', block_height: 12, status: 'complete' }),
      putPost({ author: 'NQ01 ALICE', post_id: '3', block_height: 14, status: 'pending' }),
      putPost({ author: 'NQ02 BOB', post_id: '1', block_height: 11, status: 'inline' }),
      putPost({ author: 'NQ03 HIDDEN', post_id: '1', block_height: 13, status: 'inline' }),
    ])

    const users = await getMostActiveUsers(10)

    expect(users).toEqual([
      expect.objectContaining({ address: 'NQ01 ALICE', username: 'alice', postCount: 2 }),
      expect.objectContaining({ address: 'NQ02 BOB', username: 'bob', postCount: 1 }),
    ])
  })
})

describe('catalog_refs store', () => {
  it('stores and retrieves refs by type filter', async () => {
    await putCatalogRef({
      tx_hash: 'hash1',
      type: 'POST_INLINE',
      sender: 'NQ01 TEST',
      post_id: '0000000100000001',
      username: null,
      block_height: 300,
      tx_index: 1,
      seen_at: Date.now(),
    })
    const refs = await getCatalogRefs(['POST_INLINE'], { limit: 10 })
    expect(refs).toHaveLength(1)
    expect(refs[0].post_id).toBe('0000000100000001')
  })
})
