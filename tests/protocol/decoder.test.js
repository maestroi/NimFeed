import { describe, it, expect } from 'vitest'
import { parseTransaction } from '../../src/protocol/decoder.js'
import { buildProfileClaim, buildPostInline, buildPostStart, buildPostChunk } from '../../src/protocol/encoder.js'
import { bytesToHex } from '../../src/protocol/utils.js'
import { POST_CATALOG_ADDRESS } from '../../src/protocol/constants.js'

function mockTx(payload, to = POST_CATALOG_ADDRESS) {
  return {
    hash: 'abc',
    from: 'NQ01SENDER',
    to,
    data: bytesToHex(payload),
    blockHeight: 100,
    transactionIndex: 0,
    timestamp: 0,
  }
}

describe('parseTransaction', () => {
  it('returns null for non-NF magic', () => {
    const tx = mockTx(new Uint8Array([0x00, 0x00, 0x01, 0x01]))
    expect(parseTransaction(tx)).toBeNull()
  })

  it('parses PROFILE_CLAIM', () => {
    const tx = mockTx(buildProfileClaim('bob', 'Bob B'))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('PROFILE_CLAIM')
    expect(ev.username).toBe('bob')
    expect(ev.displayName).toBe('Bob B')
    expect(ev.from).toBe('NQ01SENDER')
  })

  it('parses POST_INLINE without reply', () => {
    const postId = new Uint8Array(8).fill(1)
    const tx = mockTx(buildPostInline(postId, 'hello world'))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_INLINE')
    expect(ev.text).toBe('hello world')
    expect(ev.isReply).toBe(false)
  })

  it('parses POST_START', () => {
    const postId = new Uint8Array(8).fill(2)
    const hash = new Uint8Array(8).fill(0xab)
    const tx = mockTx(buildPostStart(postId, 3, true, hash))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_START')
    expect(ev.totalChunks).toBe(3)
    expect(ev.compressed).toBe(true)
    expect(ev.contentHash).toHaveLength(16)
  })

  it('parses POST_CHUNK', () => {
    const postId = new Uint8Array(8).fill(3)
    const data = new Uint8Array(30).fill(0xcc)
    const tx = mockTx(buildPostChunk(postId, 1, data), 'NQ_DERIVED')
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_CHUNK')
    expect(ev.chunkIndex).toBe(1)
    expect(ev.dataLen).toBe(30)
  })
})
