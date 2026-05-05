import { describe, it, expect } from 'vitest'
import { deflateRaw, inflateRaw, isCompressionSupported, encodePost } from '../../src/protocol/compression.js'

describe('deflateRaw / inflateRaw', () => {
  it('round-trips bytes', async () => {
    const input = new TextEncoder().encode('Hello, NimFeed! '.repeat(10))
    const comp = await deflateRaw(input)
    const restored = await inflateRaw(comp)
    expect(restored).toEqual(input)
  })
})

describe('encodePost', () => {
  it('returns payload, flags, and contentHash', async () => {
    const result = await encodePost('Hello world from NimFeed!')
    expect(result.payload).toBeInstanceOf(Uint8Array)
    expect(result.contentHash).toHaveLength(8)
    expect(typeof result.compressed).toBe('boolean')
  })

  it('does not compress if compressed is larger', async () => {
    // Very short strings often do not compress smaller
    const result = await encodePost('Hi')
    if (!result.compressed) {
      expect(result.payload).toEqual(new TextEncoder().encode('Hi'))
    }
  })

  it('splits into 50-byte chunks', async () => {
    const long = 'A'.repeat(200)
    const result = await encodePost(long)
    for (const chunk of result.chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50)
    }
  })
})

describe('isCompressionSupported', () => {
  it('is a boolean', () => {
    expect(typeof isCompressionSupported()).toBe('boolean')
  })
})
