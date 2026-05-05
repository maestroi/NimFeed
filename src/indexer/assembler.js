import { db } from '../db/schema.js'
import { inflateRaw } from '../protocol/compression.js'
import { hexToBytes } from '../protocol/utils.js'

export async function tryAssemble(author, postId) {
  const post = await db.posts.get([author, postId])
  if (!post || post.total_chunks === null) return
  if (post.chunks_received < post.total_chunks) return

  const chunks = await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, postId, 0], [author, postId, 255])
    .toArray()

  chunks.sort((a, b) => a.chunk_index - b.chunk_index)

  const totalLen = chunks.reduce((s, c) => s + (c.data_len ?? c.data?.length ?? 0), 0)
  const encoded = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
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
