import { describe, expect, it } from 'vitest'
import { buildPostInline, buildPostStart, buildPostChunk } from '../../src/protocol/encoder.js'
import {
  decodeMiniAppEnvelopeHex,
  encodeMiniAppEnvelope,
  MINI_APP_CHUNK_DATA_SIZE,
} from '../../src/protocol/miniAppEnvelope.js'
import { bytesToHex } from '../../src/protocol/utils.js'

describe('mini app transaction envelope', () => {
  it('round-trips an inline post through a text transaction', () => {
    const payload = buildPostInline(new Uint8Array(8).fill(1), 'hello')
    const text = encodeMiniAppEnvelope(payload)
    const chainHex = bytesToHex(new TextEncoder().encode(text))

    expect(text.length).toBeLessThanOrEqual(64)
    expect(decodeMiniAppEnvelopeHex(chainHex)).toBe(bytesToHex(payload).replace(/(00)+$/, ''))
  })

  it('fits post starts and mini-app-sized chunks', () => {
    const start = buildPostStart(new Uint8Array(8).fill(2), 3, false, new Uint8Array(8).fill(3))
    const chunk = buildPostChunk(
      new Uint8Array(8).fill(4),
      0,
      new Uint8Array(MINI_APP_CHUNK_DATA_SIZE).fill(5),
    )

    expect(encodeMiniAppEnvelope(start).length).toBeLessThanOrEqual(64)
    expect(encodeMiniAppEnvelope(chunk).length).toBeLessThanOrEqual(64)
  })

  it('preserves meaningful trailing zero bytes in chunks', () => {
    const data = new Uint8Array([1, 2, 0])
    const payload = buildPostChunk(new Uint8Array(8).fill(4), 0, data)
    const chainHex = bytesToHex(new TextEncoder().encode(encodeMiniAppEnvelope(payload)))
    const decoded = decodeMiniAppEnvelopeHex(chainHex)

    expect(decoded.endsWith('010200')).toBe(true)
  })

  it('rejects payloads that cannot fit a text transaction', () => {
    expect(() => encodeMiniAppEnvelope(new Uint8Array(64).fill(255))).toThrow(
      'does not fit in a Nimiq Pay text transaction',
    )
  })
})
