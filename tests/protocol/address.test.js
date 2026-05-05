import { describe, it, expect } from 'vitest'
import {
  nqToAddressBytes,
  addressBytesToNq,
  derivePostAddress,
  canonicalNqAddress,
  toAddressBytes,
} from '../../src/protocol/address.js'

describe('derivePostAddress', () => {
  it('returns 20 bytes', async () => {
    const author = new Uint8Array(20).fill(1)
    const postId = new Uint8Array(8).fill(2)
    const result = await derivePostAddress(author, postId)
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBe(20)
  })

  it('is deterministic', async () => {
    const author = new Uint8Array(20).fill(3)
    const postId = new Uint8Array(8).fill(4)
    const a = await derivePostAddress(author, postId)
    const b = await derivePostAddress(author, postId)
    expect(a).toEqual(b)
  })

  it('differs for different authors', async () => {
    const postId = new Uint8Array(8).fill(5)
    const x = await derivePostAddress(new Uint8Array(20).fill(1), postId)
    const y = await derivePostAddress(new Uint8Array(20).fill(2), postId)
    expect(x).not.toEqual(y)
  })

  it('differs for different post ids', async () => {
    const author = new Uint8Array(20).fill(1)
    const x = await derivePostAddress(author, new Uint8Array(8).fill(1))
    const y = await derivePostAddress(author, new Uint8Array(8).fill(2))
    expect(x).not.toEqual(y)
  })
})

describe('NQ address checksum and canonicalization', () => {
  it('keeps known mainnet address checksum when canonicalized', () => {
    const known = 'NQ19 LLHP G0ML 37RM 5JJD RME1 GLFY 75PQ 402Y'
    expect(canonicalNqAddress(known)).toBe(known)
  })

  it('produces expected known address from bytes', () => {
    const known = 'NQ19 LLHP G0ML 37RM 5JJD RME1 GLFY 75PQ 402Y'
    const bytes = nqToAddressBytes(known)
    expect(addressBytesToNq(bytes)).toBe(known)
    expect(toAddressBytes(known)).toEqual(bytes)
  })
})
