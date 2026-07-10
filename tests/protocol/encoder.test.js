import { describe, it, expect } from 'vitest'
import {
  buildProfileClaim,
  buildPostInline,
  buildPostStart,
  buildPostChunk,
} from '../../src/protocol/encoder.js'
import { TYPES, VERSION, MAGIC } from '../../src/protocol/constants.js'
import { generatePostId } from '../../src/protocol/utils.js'

function header(bytes) {
  return { magic: [bytes[0], bytes[1]], version: bytes[2], type: bytes[3] }
}

describe('buildProfileClaim', () => {
  it('produces a compact payload with correct header', () => {
    const bytes = buildProfileClaim('alice', 'Alice A')
    expect(bytes.byteLength).toBe(17)
    const h = header(bytes)
    expect(h.magic[0]).toBe(MAGIC[0])
    expect(h.magic[1]).toBe(MAGIC[1])
    expect(h.version).toBe(VERSION)
    expect(h.type).toBe(TYPES.PROFILE_CLAIM)
  })

  it('null-terminates username', () => {
    const bytes = buildProfileClaim('alice', 'Alice')
    expect(bytes[9]).toBe(0x00)
  })

  it('normalizes username to lowercase', () => {
    const bytes = buildProfileClaim('ALICE', 'Alice')
    const username = new TextDecoder().decode(bytes.slice(4, 9))
    expect(username).toBe('alice')
  })
})

describe('buildPostInline', () => {
  it('produces 64-byte payload', () => {
    const bytes = buildPostInline(new Uint8Array(8), 'hello')
    expect(bytes.byteLength).toBe(64)
    expect(bytes[3]).toBe(TYPES.POST_INLINE)
  })

  it('sets is_reply flag correctly', () => {
    const noReply = buildPostInline(new Uint8Array(8), 'hi')
    expect(noReply[12] & 0x01).toBe(0)

    const replyAuthor = new Uint8Array(20).fill(1)
    const replyPostId = new Uint8Array(8).fill(2)
    const withReply = buildPostInline(new Uint8Array(8), 'hi', { replyAuthor, replyPostId })
    expect(withReply[12] & 0x01).toBe(1)
  })
})

describe('buildPostStart', () => {
  it('produces 64-byte payload with total_chunks', () => {
    const postId = new Uint8Array(8).fill(7)
    const hash = new Uint8Array(8).fill(0xff)
    const bytes = buildPostStart(postId, 3, false, hash)
    expect(bytes.byteLength).toBe(64)
    expect(bytes[3]).toBe(TYPES.POST_START)
    expect(bytes[12]).toBe(3)
  })

  it('sets compressed flag in byte 13', () => {
    const postId = new Uint8Array(8)
    const hash = new Uint8Array(8)
    const noComp = buildPostStart(postId, 1, false, hash)
    const comp = buildPostStart(postId, 1, true, hash)
    expect(noComp[13] & 0x01).toBe(0)
    expect(comp[13] & 0x01).toBe(1)
  })

  it('produces a 30-byte compact-reply payload referencing only replyToPostId', () => {
    const postId = new Uint8Array(8).fill(7)
    const hash = new Uint8Array(8).fill(0xff)
    const replyPostId = new Uint8Array(8).fill(0x42)
    const bytes = buildPostStart(postId, 1, false, hash, { replyPostId })

    expect(bytes[13] & 0x02).toBe(0x02) // isReply
    expect(bytes[13] & 0x04).toBe(0x04) // compact
    expect(bytes.slice(22, 30)).toEqual(replyPostId)
    // Compact reply payload is exactly 30 meaningful bytes (no author bytes written).
    expect(bytes.slice(30, 50)).toEqual(new Uint8Array(20))
  })

  it('produces the existing 50-byte full-reply payload when replyAuthor is provided', () => {
    const postId = new Uint8Array(8).fill(7)
    const hash = new Uint8Array(8).fill(0xff)
    const replyAuthor = new Uint8Array(20).fill(1)
    const replyPostId = new Uint8Array(8).fill(2)
    const bytes = buildPostStart(postId, 1, false, hash, { replyAuthor, replyPostId })

    expect(bytes[13] & 0x02).toBe(0x02) // isReply
    expect(bytes[13] & 0x04).toBe(0x00) // not compact
    expect(bytes.slice(22, 42)).toEqual(replyAuthor)
    expect(bytes.slice(42, 50)).toEqual(replyPostId)
  })
})

describe('buildPostChunk', () => {
  it('produces 64-byte payload with chunk_index and data_len', () => {
    const postId = new Uint8Array(8).fill(9)
    const data = new Uint8Array(30).fill(0xaa)
    const bytes = buildPostChunk(postId, 2, data)
    expect(bytes.byteLength).toBe(64)
    expect(bytes[3]).toBe(TYPES.POST_CHUNK)
    expect(bytes[12]).toBe(2)
    expect(bytes[13]).toBe(30)
    expect(bytes.slice(14, 44)).toEqual(data)
  })
})
