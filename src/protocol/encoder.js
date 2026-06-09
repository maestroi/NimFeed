import { MAGIC, VERSION, TYPES, CHUNK_DATA_SIZE } from './constants.js'
import { normalizeUsername } from './utils.js'

function makePayload(type) {
  const buf = new Uint8Array(64)
  buf[0] = MAGIC[0]
  buf[1] = MAGIC[1]
  buf[2] = VERSION
  buf[3] = type
  return buf
}

function writeNullTerminated(buf, offset, maxLen, str) {
  const encoded = new TextEncoder().encode(str).slice(0, maxLen - 1)
  buf.set(encoded, offset)
}

export function buildProfileClaim(username, displayName) {
  const normalized = normalizeUsername(username) ?? username.toLowerCase().slice(0, 31)
  const usernameBytes = new TextEncoder().encode(normalized)
  const dnBytes = new TextEncoder().encode((displayName ?? '').slice(0, 23))
  // Compact: header(4) + username + 0x00 separator + displayName (exact size, no padding)
  // Decoder distinguishes from legacy 64-byte fixed format by payload length.
  const buf = new Uint8Array(4 + usernameBytes.length + 1 + dnBytes.length)
  buf[0] = MAGIC[0]
  buf[1] = MAGIC[1]
  buf[2] = VERSION
  buf[3] = TYPES.PROFILE_CLAIM
  buf.set(usernameBytes, 4)
  buf.set(dnBytes, 4 + usernameBytes.length + 1)
  return buf
}

export function buildPostInline(postIdBytes8, text, reply = null) {
  const buf = makePayload(TYPES.POST_INLINE)
  buf.set(postIdBytes8, 4)
  if (reply) {
    buf[12] = 0x01
    buf.set(reply.replyAuthor.slice(0, 20), 13)
    buf.set(reply.replyPostId.slice(0, 8), 33)
    const textBytes = new TextEncoder().encode(text).slice(0, 23)
    buf.set(textBytes, 41)
  } else {
    buf[12] = 0x00
    const textBytes = new TextEncoder().encode(text).slice(0, 51)
    buf.set(textBytes, 13)
  }
  return buf
}

export function buildPostStart(postIdBytes8, totalChunks, compressed, contentHash8, reply = null) {
  const buf = makePayload(TYPES.POST_START)
  buf.set(postIdBytes8, 4)
  buf[12] = totalChunks
  buf[13] = (compressed ? 0x01 : 0x00) | (reply ? 0x02 : 0x00)
  buf.set(contentHash8, 14)
  if (reply) {
    buf.set(reply.replyAuthor.slice(0, 20), 22)
    buf.set(reply.replyPostId.slice(0, 8), 42)
  }
  return buf
}

export function buildPostChunk(postIdBytes8, chunkIndex, data) {
  const buf = makePayload(TYPES.POST_CHUNK)
  buf.set(postIdBytes8, 4)
  buf[12] = chunkIndex
  const slice = data.slice(0, CHUNK_DATA_SIZE)
  buf[13] = slice.length
  buf.set(slice, 14)
  return buf
}

export function buildFollow(targetAddressBytes20) {
  const buf = makePayload(TYPES.FOLLOW)
  buf.set(targetAddressBytes20.slice(0, 20), 4)
  return buf
}

export function buildUnfollow(targetAddressBytes20) {
  const buf = makePayload(TYPES.UNFOLLOW)
  buf.set(targetAddressBytes20.slice(0, 20), 4)
  return buf
}

export function splitInto50ByteChunks(payload) {
  const chunks = []
  for (let i = 0; i < payload.length; i += 50) {
    chunks.push(payload.slice(i, i + 50))
  }
  return chunks
}
