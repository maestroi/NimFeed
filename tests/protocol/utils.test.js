import { describe, it, expect } from 'vitest'
import {
  hexToBytes,
  bytesToHex,
  postIdToHex,
  generatePostId,
  trimNulls,
  normalizeUsername,
} from '../../src/protocol/utils.js'
import { addressBytesToNq, nqToAddressBytes } from '../../src/protocol/address.js'

describe('hexToBytes / bytesToHex', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array([0x4e, 0x46, 0x01, 0x03])
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes)
  })
})

describe('postIdToHex', () => {
  it('produces 16-char big-endian hex (msb-first string)', () => {
    const bytes = new Uint8Array(8).fill(0)
    bytes[0] = 0x01
    const hex = postIdToHex(bytes)
    expect(hex).toHaveLength(16)
    expect(hex).toBe('0000000000000001')
  })
})

describe('generatePostId', () => {
  it('returns 8 bytes', () => {
    const id = generatePostId()
    expect(id).toBeInstanceOf(Uint8Array)
    expect(id.byteLength).toBe(8)
  })

  it('embeds unix seconds in first 4 bytes LE', () => {
    const before = Math.floor(Date.now() / 1000)
    const id = generatePostId()
    const view = new DataView(id.buffer)
    const secs = view.getUint32(0, true)
    expect(secs).toBeGreaterThanOrEqual(before)
    expect(secs).toBeLessThanOrEqual(before + 2)
  })
})

describe('trimNulls', () => {
  it('trims trailing null bytes', () => {
    const buf = new Uint8Array([0x68, 0x69, 0x00, 0x00])
    expect(trimNulls(buf)).toEqual(new Uint8Array([0x68, 0x69]))
  })
})

describe('normalizeUsername', () => {
  it('lowercases and strips invalid chars', () => {
    expect(normalizeUsername('Hello_World!')).toBe('hello_world')
  })
})

describe('addressBytesToNq / nqToAddressBytes', () => {
  it('round-trips a known NQ address', () => {
    const bytes = new Uint8Array(20)
    const nq = addressBytesToNq(bytes)
    expect(nq).toMatch(/^NQ/)
    expect(nqToAddressBytes(nq)).toEqual(bytes)
  })
})
