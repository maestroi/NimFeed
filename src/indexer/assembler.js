import { db } from '../db/schema.js'
import { inflateRaw } from '../protocol/compression.js'
import { hexToBytes } from '../protocol/utils.js'

export async function tryAssemble(author, postId) {
  const post = await db.posts.get([author, postId])
  if (!post || post.total_chunks === null) return

  const chunks = await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, postId, 0], [author, postId, 255])
    .toArray()

  // Keep only the latest stored row per chunk index (duplicate uploads overwrite by key).
  const byIndex = new Map()
  for (const chunk of chunks) byIndex.set(chunk.chunk_index, chunk)
  const unique = [...byIndex.values()].sort((a, b) => a.chunk_index - b.chunk_index)
  const chunkCount = unique.length

  if (post.chunks_received !== chunkCount) {
    await db.posts.update([author, postId], { chunks_received: chunkCount })
  }
  if (chunkCount < post.total_chunks) return

  for (let i = 0; i < post.total_chunks; i++) {
    if (unique[i]?.chunk_index !== i) {
      return
    }
  }

  const totalLen = unique.reduce((s, c) => s + (c.data_len ?? c.data?.length ?? 0), 0)
  const encoded = new Uint8Array(totalLen)
  let offset = 0
  for (const c of unique) {
    const len = c.data_len ?? c.data.length
    encoded.set(c.data.slice(0, len), offset)
    offset += len
  }

  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const hash8 = new Uint8Array(digest).slice(0, 8)
  const expected = hexToBytes(post.content_hash)

  if (!bytesEqual(hash8, expected)) {
    await db.posts.update([author, postId], { status: 'invalid_hash' })
    return
  }

  const payload = post.compressed ? await inflateRaw(encoded) : encoded
  const content = new TextDecoder().decode(payload)

  await db.posts.update([author, postId], { status: 'complete', content })
  await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, postId, 0], [author, postId, 255])
    .delete()
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
