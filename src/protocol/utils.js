export { addressBytesToNq, nqToAddressBytes, derivePostAddress, toAddressBytes } from './address.js'

export function hexToBytes(hex) {
  if (!hex || hex.length === 0) return new Uint8Array(0)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Big-endian hex for lexicographic sort = chronological sort of post IDs */
export function postIdToHex(bytes8) {
  const u8 = bytes8 instanceof Uint8Array ? bytes8 : new Uint8Array(bytes8)
  const reversed = new Uint8Array(8)
  for (let i = 0; i < 8; i++) reversed[i] = u8[7 - i]
  return bytesToHex(reversed)
}

export function hexToPostIdBytes(hex16) {
  const rev = hexToBytes(hex16)
  const bytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) bytes[i] = rev[7 - i]
  return bytes
}

export function generatePostId() {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(Date.now() / 1000), true)
  view.setUint32(4, crypto.getRandomValues(new Uint32Array(1))[0], true)
  return new Uint8Array(buf)
}

export function trimNulls(bytes) {
  let end = bytes.length
  while (end > 0 && bytes[end - 1] === 0) end--
  return bytes.slice(0, end)
}

export function normalizeUsername(raw) {
  if (!raw) return null
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (s.length < 3 || s.length > 31) return null
  return s
}
