// Nimiq NQ address: custom base32 alphabet + checksum (phase 1 plan).
import { sha256Bytes } from './hash.js'

const NQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'
const NQ_PREFIX = 'NQ'

function toBase32(bytes) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += NQ_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += NQ_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function fromBase32(str) {
  const bytes = []
  let bits = 0
  let value = 0
  for (const ch of str) {
    const idx = NQ_ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

function ibanChecksum(countryCode, bban) {
  const rearranged = `${bban}${countryCode}00`
  let remainder = 0
  for (const ch of rearranged) {
    const chunk = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }
  return String(98 - remainder).padStart(2, '0')
}

function compactNq(addr) {
  return String(addr ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

function isNqBody(body32) {
  if (body32.length !== 32) return false
  for (const ch of body32) {
    if (!NQ_ALPHABET.includes(ch)) return false
  }
  return true
}

function hasValidNqChecksum(compact) {
  if (compact.length !== 36) return false
  if (!compact.startsWith(NQ_PREFIX)) return false
  const check = compact.slice(2, 4)
  const bban = compact.slice(4)
  if (!/^[0-9]{2}$/.test(check)) return false
  if (!isNqBody(bban)) return false

  const rearranged = `${bban}${compact.slice(0, 4)}`
  let remainder = 0
  for (const ch of rearranged) {
    const chunk = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }
  return remainder === 1
}

export function addressBytesToNq(bytes20) {
  const b32 = toBase32(bytes20).padStart(32, '0')
  const check = ibanChecksum(NQ_PREFIX, b32)
  const groups = b32.match(/.{1,4}/g).join(' ')
  return `${NQ_PREFIX}${check} ${groups}`
}

export function nqToAddressBytes(nq) {
  const clean = compactNq(nq).slice(4)
  return fromBase32(clean).slice(0, 20)
}

/** 40-char hex (raw address) or NQ string → Uint8Array(20) */
export function toAddressBytes(addr) {
  if (!addr) return null
  const s = String(addr).trim()
  if (/^nq/i.test(s)) {
    const compact = compactNq(s)
    if (!hasValidNqChecksum(compact)) return null
    return nqToAddressBytes(compact)
  }
  const hex = hexToBytesInternal(s.replace(/^0x/i, ''))
  if (hex.length !== 20) return null
  return hex
}

/** Stable spaced NQ string for IndexedDB keys and lookups (normalizes spacing/casing from Hub vs RPC). */
export function canonicalNqAddress(addr) {
  const bytes = toAddressBytes(addr)
  if (!bytes || bytes.length !== 20) return String(addr ?? '').trim()
  return addressBytesToNq(bytes)
}

function hexToBytesInternal(hex) {
  if (!hex || hex.length === 0) return new Uint8Array(0)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function derivePostAddress(authorAddressBytes20, postIdBytes8) {
  const salt = new TextEncoder().encode('nimfeed')
  const seed = new Uint8Array(20 + 8 + salt.length)
  seed.set(authorAddressBytes20, 0)
  seed.set(postIdBytes8, 20)
  seed.set(salt, 28)
  return sha256Bytes(seed).slice(0, 20)
}
