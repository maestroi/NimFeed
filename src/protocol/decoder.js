import { TYPES, VERSION } from './constants.js'
import { hexToBytes, trimNulls, postIdToHex } from './utils.js'
import { addressBytesToNq, canonicalNqAddress } from './address.js'
import { decodeMiniAppEnvelopeHex } from './miniAppEnvelope.js'

const MAGIC_HEX = '4e46'

export function parseTransaction(tx) {
  const chainHex = (tx.data ?? '').toLowerCase().replace(/^0x/, '')
  const hex = decodeMiniAppEnvelopeHex(chainHex) ?? chainHex
  if (!hex || hex.length < 8) return null
  if (hex.slice(0, 4) !== MAGIC_HEX) return null

  const bytes = hexToBytes(hex)
  if (bytes[2] !== VERSION) return null

  const type = bytes[3]
  const base = {
    txHash: tx.hash,
    from: tx.from ? canonicalNqAddress(tx.from) : tx.from,
    to: tx.to ? canonicalNqAddress(tx.to) : tx.to,
    blockHeight: tx.blockHeight,
    txIndex: tx.transactionIndex ?? 0,
  }

  switch (type) {
    case TYPES.PROFILE_CLAIM:
      return decodeProfileClaim(base, bytes)
    case TYPES.POST_INLINE:
      return decodePostInline(base, bytes)
    case TYPES.POST_START:
      return decodePostStart(base, bytes)
    case TYPES.POST_CHUNK:
      return decodePostChunk(base, bytes)
    case TYPES.FOLLOW:
      return decodeFollowUnfollow(base, bytes, 'FOLLOW')
    case TYPES.UNFOLLOW:
      return decodeFollowUnfollow(base, bytes, 'UNFOLLOW')
    default:
      return null
  }
}

function readNullTerminated(bytes, offset, maxLen) {
  return new TextDecoder().decode(trimNulls(bytes.slice(offset, offset + maxLen)))
}

function decodeProfileClaim(base, bytes) {
  let username, displayName
  if (bytes.length === 64) {
    // Legacy fixed-layout: username at [4..35], displayName at [36..59]
    username = readNullTerminated(bytes, 4, 32)
    displayName = readNullTerminated(bytes, 36, 24)
  } else {
    // Compact: header(4) + username + 0x00 + displayName
    let nullPos = bytes.length
    for (let i = 4; i < bytes.length; i++) {
      if (bytes[i] === 0) { nullPos = i; break }
    }
    username = new TextDecoder().decode(bytes.slice(4, nullPos))
    displayName = nullPos < bytes.length
      ? new TextDecoder().decode(trimNulls(bytes.slice(nullPos + 1)))
      : ''
  }
  return { ...base, event: 'PROFILE_CLAIM', username, displayName }
}

function decodePostInline(base, bytes) {
  const postId = postIdToHex(bytes.slice(4, 12))
  const flags = bytes[12]
  const isReply = !!(flags & 0x01)
  let replyToAuthor = null
  let replyToPostId = null
  let text
  if (isReply) {
    replyToAuthor = addressBytesToNq(bytes.slice(13, 33))
    replyToPostId = postIdToHex(bytes.slice(33, 41))
    text = new TextDecoder().decode(trimNulls(bytes.slice(41, 64)))
  } else {
    text = new TextDecoder().decode(trimNulls(bytes.slice(13, 64)))
  }
  return { ...base, event: 'POST_INLINE', postId, isReply, replyToAuthor, replyToPostId, text }
}

function decodePostStart(base, bytes) {
  const postId = postIdToHex(bytes.slice(4, 12))
  const totalChunks = bytes[12]
  const flags = bytes[13]
  const compressed = !!(flags & 0x01)
  const isCompactReply = !!(flags & 0x04)
  const isReply = !!(flags & 0x02) || isCompactReply
  const contentHash = Array.from(bytes.slice(14, 22))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  let replyToAuthor = null
  let replyToPostId = null
  if (isCompactReply) {
    replyToPostId = postIdToHex(bytes.slice(22, 30))
  } else if (isReply) {
    replyToAuthor = addressBytesToNq(bytes.slice(22, 42))
    replyToPostId = postIdToHex(bytes.slice(42, 50))
  }
  return {
    ...base,
    event: 'POST_START',
    postId,
    totalChunks,
    compressed,
    contentHash,
    isReply,
    isCompactReply,
    replyToAuthor,
    replyToPostId,
  }
}

function decodePostChunk(base, bytes) {
  const postId = postIdToHex(bytes.slice(4, 12))
  const chunkIndex = bytes[12]
  const dataLen = bytes[13]
  const data = bytes.slice(14, 14 + dataLen)
  return { ...base, event: 'POST_CHUNK', postId, chunkIndex, dataLen, data }
}

function decodeFollowUnfollow(base, bytes, event) {
  const targetAddress = addressBytesToNq(bytes.slice(4, 24))
  return { ...base, event, targetAddress }
}
