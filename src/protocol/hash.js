import { sha256 } from '@noble/hashes/sha2.js'

export function sha256Bytes(bytes) {
  return sha256(bytes)
}
