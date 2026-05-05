import { describe, it, expect } from 'vitest'
import { parseTransaction } from '../../src/protocol/decoder.js'
import { buildFollow, buildUnfollow } from '../../src/protocol/encoder.js'
import { bytesToHex, nqToAddressBytes } from '../../src/protocol/utils.js'

function mockTx(payload, from = 'NQ00 SELF', to = 'NQ00 SELF') {
  return {
    hash: 'abc',
    from,
    to,
    data: bytesToHex(payload),
    blockHeight: 100,
    transactionIndex: 0,
    timestamp: 0,
  }
}

describe('FOLLOW / UNFOLLOW address format', () => {
  it('returns targetAddress as NQ string, not hex', () => {
    const targetNq = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
    const targetBytes = nqToAddressBytes(targetNq)
    const tx = mockTx(buildFollow(targetBytes))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('FOLLOW')
    expect(ev.targetAddress).toMatch(/^NQ/)
  })

  it('returns UNFOLLOW event for unfollow payload', () => {
    const targetBytes = new Uint8Array(20).fill(2)
    const tx = mockTx(buildUnfollow(targetBytes))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('UNFOLLOW')
  })
})
