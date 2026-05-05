import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { tryAssemble } from '../../src/indexer/assembler.js'
import { encodePost } from '../../src/protocol/compression.js'
import { bytesToHex, generatePostId, postIdToHex } from '../../src/protocol/utils.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seedPost(text) {
  const { payload, compressed, contentHash, chunks } = await encodePost(text)
  const postIdBuf = generatePostId()
  const post_id = postIdToHex(postIdBuf)
  const author = 'NQ01 TEST'

  await db.posts.put({
    author,
    post_id,
    block_height: 100,
    tx_index: 0,
    content: null,
    total_chunks: chunks.length,
    chunks_received: chunks.length,
    compressed,
    content_hash: bytesToHex(contentHash),
    is_reply: false,
    is_inline: false,
    reply_to_author: null,
    reply_to_post_id: null,
    status: 'pending',
    first_seen_at: 100,
  })

  for (let i = 0; i < chunks.length; i++) {
    await db.post_chunks.put({ author, post_id, chunk_index: i, data: chunks[i], data_len: chunks[i].length })
  }

  return { author, post_id, text }
}

describe('tryAssemble', () => {
  it('assembles chunks into post content', async () => {
    const { author, post_id, text } = await seedPost('Hello NimFeed!')
    await tryAssemble(author, post_id)
    const post = await db.posts.get([author, post_id])
    expect(post.status).toBe('complete')
    expect(post.content).toBe(text)
  })

  it('deletes chunks after successful assembly', async () => {
    const { author, post_id } = await seedPost('Clean up chunks please')
    await tryAssemble(author, post_id)
    const remaining = await db.post_chunks
      .where('[author+post_id+chunk_index]')
      .between([author, post_id, 0], [author, post_id, 255], true, true)
      .count()
    expect(remaining).toBe(0)
  })

  it('marks post invalid_hash on tampered data', async () => {
    const { author, post_id } = await seedPost('Tamper test')
    const chunks = await db.post_chunks
      .where('[author+post_id+chunk_index]')
      .between([author, post_id, 0], [author, post_id, 255], true, true)
      .toArray()
    if (chunks.length) {
      const bad = new Uint8Array(chunks[0].data)
      bad[0] = ~bad[0]
      await db.post_chunks.put({ ...chunks[0], data: bad })
    }
    await tryAssemble(author, post_id)
    const post = await db.posts.get([author, post_id])
    expect(post.status).toBe('invalid_hash')
  })

  it('does nothing if total_chunks is null (POST_START not yet seen)', async () => {
    await db.posts.put({
      author: 'NQ01 TEST',
      post_id: 'deadbeef00000001',
      block_height: 100,
      tx_index: 0,
      content: null,
      total_chunks: null,
      chunks_received: 1,
      compressed: false,
      content_hash: '',
      is_reply: false,
      is_inline: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'pending',
      first_seen_at: 100,
    })
    await tryAssemble('NQ01 TEST', 'deadbeef00000001')
    const post = await db.posts.get(['NQ01 TEST', 'deadbeef00000001'])
    expect(post.status).toBe('pending')
  })

  it('assembles when chunk rows are complete even if chunks_received counter is stale', async () => {
    const { author, post_id, text } = await seedPost('Counter drift should still assemble.')
    await db.posts.update([author, post_id], { chunks_received: 0 })

    await tryAssemble(author, post_id)

    const post = await db.posts.get([author, post_id])
    expect(post.status).toBe('complete')
    expect(post.content).toBe(text)
  })
})
