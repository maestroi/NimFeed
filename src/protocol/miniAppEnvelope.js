import { bytesToHex } from './utils.js'
import { TYPES } from './constants.js'

const PREFIX = 'NFH:'
const MAX_TEXT_BYTES = 64
export const MINI_APP_CHUNK_DATA_SIZE = 16
export const MINI_APP_INLINE_DATA_SIZE = 17

function semanticEnd(payload) {
  switch (payload[3]) {
    case TYPES.PROFILE_CLAIM:
      return 4
    case TYPES.POST_START:
      if (payload[13] & 0x04) return 30
      return payload[13] & 0x02 ? 50 : 22
    case TYPES.POST_CHUNK:
      return 14 + payload[13]
    case TYPES.FOLLOW:
    case TYPES.UNFOLLOW:
      return 24
    default:
      return 0
  }
}

export function encodeMiniAppEnvelope(payload) {
  let end = payload.length
  const minEnd = semanticEnd(payload)
  while (end > minEnd && payload[end - 1] === 0) end--
  const text = PREFIX + bytesToHex(payload.slice(0, end))
  if (new TextEncoder().encode(text).length > MAX_TEXT_BYTES) {
    throw new Error('NimFeed payload does not fit in a Nimiq Pay text transaction.')
  }
  return text
}

export function decodeMiniAppEnvelopeHex(chainHex) {
  const bytes = new Uint8Array(chainHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(chainHex.slice(i * 2, i * 2 + 2), 16)
  }
  const text = new TextDecoder().decode(bytes)
  if (!text.startsWith(PREFIX)) return null
  const payloadHex = text.slice(PREFIX.length)
  return /^[0-9a-f]+$/i.test(payloadHex) && payloadHex.length % 2 === 0 ? payloadHex : null
}
