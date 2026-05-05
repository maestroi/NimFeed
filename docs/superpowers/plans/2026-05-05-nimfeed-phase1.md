# NimFeed Phase 1 — Core MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working on-chain microblogging MVP on Nimiq 2.0 Albatross — Hub login, profile claim, post creation (inline + chunked), global feed, and profile view, all backed by a browser IndexedDB indexer with no backend.

**Architecture:** Post catalog + derived post addresses. A single POST_CATALOG_ADDRESS receives PROFILE_CLAIM, POST_INLINE, and POST_START events. POST_CHUNK transactions go to a deterministic derived address per post. No self-transactions. No per-user address sync.

**Tech Stack:** Vue 3.5, Vite 8, Tailwind CSS 4, Pinia 3, Dexie 4, @nimiq/hub-api ^1.13, plain JavaScript (ES2022), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-05-nimfeed-design.md`

---

## File Map

```
src/
├── main.js
├── App.vue
├── router.js
├── style.css
│
├── protocol/
│   ├── constants.js         POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS, magic, type codes
│   ├── utils.js             hexToBytes, bytesToHex, postIdToHex, generatePostId, trimNulls
│   ├── address.js           derivePostAddress, nqToAddressBytes, addressBytesToNq
│   ├── encoder.js           buildProfileClaim, buildPostInline, buildPostStart, buildPostChunk
│   ├── decoder.js           parseTransaction → typed event objects
│   └── compression.js       deflateRaw, inflateRaw, isCompressionSupported
│
├── chain/
│   ├── rpc.js               NimiqRPC — getTransactionsByAddress, sendRawTransaction
│   └── hub.js               useHub — signTransaction
│
├── db/
│   ├── schema.js            Dexie instance: profile_claims, users, posts, post_chunks, catalog_refs, sync_state
│   └── queries.js           typed query helpers
│
├── indexer/
│   ├── handlers.js          handleProfileClaim, handlePostInline, handlePostStart, handlePostChunk
│   ├── assembler.js         tryAssemble
│   ├── IndexerService.js    singleton — syncPostCatalog, syncDerivedAddress, startDeltaSync
│   └── useIndexer.js        Vue composable
│
├── stores/
│   ├── auth.js              Hub login state, current user profile
│   ├── feed.js              active feed slice
│   └── ui.js                modal state, composer open, filters
│
├── composables/
│   ├── usePost.js           inline vs chunked, encode → sign → broadcast → watch
│   ├── useFeed.js           global feed pagination
│   └── useProfile.js        profile resolution
│
└── components/
    ├── layout/AppShell.vue
    ├── layout/BottomNav.vue
    ├── auth/LoginModal.vue
    ├── auth/WalletButton.vue
    ├── feed/FeedView.vue
    ├── feed/PostCard.vue
    ├── feed/PostSkeleton.vue
    ├── post/PostComposer.vue
    └── profile/
        ├── ProfileView.vue
        └── ProfileCard.vue

tests/
├── setup.js
├── protocol/utils.test.js
├── protocol/address.test.js
├── protocol/encoder.test.js
├── protocol/decoder.test.js
├── protocol/compression.test.js
├── db/schema.test.js
└── indexer/assembler.test.js
```

---

## Task 1: Project Scaffold

**Files:** `package.json`, `vite.config.js`, `index.html`, `src/style.css`, `src/main.js`, `src/App.vue`, `src/router.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "nimfeed",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@nimiq/hub-api": "^1.13.0",
    "dexie": "^4.0.0",
    "pinia": "^3.0.0",
    "vue": "^3.5.0",
    "vue-router": "^4.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-vue": "^5.0.0",
    "@vitest/ui": "^2.0.0",
    "fake-indexeddb": "^6.0.0",
    "happy-dom": "^14.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
})
```

- [ ] **Step 3: Create tests/setup.js**

```javascript
import 'fake-indexeddb/auto'
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NimFeed</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create src/style.css**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Create src/main.js**

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')
```

- [ ] **Step 7: Create src/router.js**

```javascript
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/',                 component: () => import('./components/feed/FeedView.vue') },
  { path: '/profile/:address', component: () => import('./components/profile/ProfileView.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
```

- [ ] **Step 8: Create src/App.vue**

```vue
<script setup>
import AppShell from './components/layout/AppShell.vue'
</script>
<template>
  <AppShell />
</template>
```

- [ ] **Step 9: Install dependencies and verify scaffold compiles**

```bash
npm install
npm run dev
```

Expected: Dev server starts, browser shows blank app shell (no errors in console).

- [ ] **Step 10: Commit**

```bash
git add package.json vite.config.js index.html src/ tests/setup.js
git commit -m "chore: project scaffold — Vue 3, Vite, Tailwind, Pinia, Dexie"
```

---

## Task 2: Protocol — Utils and Address

**Files:** `src/protocol/utils.js`, `src/protocol/address.js`, `tests/protocol/utils.test.js`, `tests/protocol/address.test.js`

- [ ] **Step 1: Write failing tests for utils**

Create `tests/protocol/utils.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { hexToBytes, bytesToHex, postIdToHex, generatePostId, trimNulls } from '../../src/protocol/utils.js'

describe('hexToBytes / bytesToHex', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array([0x4e, 0x46, 0x01, 0x03])
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes)
  })
})

describe('postIdToHex', () => {
  it('produces 16-char zero-padded big-endian hex', () => {
    const bytes = new Uint8Array(8).fill(0)
    bytes[0] = 0x01
    const hex = postIdToHex(bytes)
    expect(hex).toHaveLength(16)
    // big-endian: byte[0] is most significant
    expect(hex.slice(0, 2)).toBe('01')
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
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test tests/protocol/utils.test.js
```

- [ ] **Step 3: Create src/protocol/utils.js**

```javascript
export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function postIdToHex(bytes8) {
  // Store as big-endian hex for lexicographic sort = chronological sort
  const reversed = new Uint8Array(8)
  for (let i = 0; i < 8; i++) reversed[i] = bytes8[7 - i]
  return bytesToHex(reversed)
}

export function hexToPostIdBytes(hex16) {
  const reversed = hexToBytes(hex16)
  const bytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) bytes[i] = reversed[7 - i]
  return bytes
}

export function generatePostId() {
  const buf  = new ArrayBuffer(8)
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
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (s.length < 3 || s.length > 31) return null
  return s
}
```

- [ ] **Step 4: Write failing tests for address**

Create `tests/protocol/address.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { nqToAddressBytes, addressBytesToNq, derivePostAddress } from '../../src/protocol/address.js'

describe('nqToAddressBytes / addressBytesToNq', () => {
  it('round-trips a known NQ address', () => {
    // Use a known 20-zero-byte address
    const bytes = new Uint8Array(20)
    const nq = addressBytesToNq(bytes)
    expect(nq).toMatch(/^NQ/)
    expect(nqToAddressBytes(nq)).toEqual(bytes)
  })
})

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
    const a = await derivePostAddress(new Uint8Array(20).fill(1), postId)
    const b = await derivePostAddress(new Uint8Array(20).fill(2), postId)
    expect(a).not.toEqual(b)
  })

  it('differs for different post ids', async () => {
    const author = new Uint8Array(20).fill(1)
    const a = await derivePostAddress(author, new Uint8Array(8).fill(1))
    const b = await derivePostAddress(author, new Uint8Array(8).fill(2))
    expect(a).not.toEqual(b)
  })
})
```

- [ ] **Step 5: Create src/protocol/address.js**

```javascript
// Nimiq NQ address uses a custom base32 alphabet and a checksum.
// This minimal implementation covers the NimFeed use case.
// For production, replace with @nimiq/utils if available.

const NQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

function toBase32(bytes) {
  let bits = 0, value = 0, output = ''
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
  let bits = 0, value = 0
  for (const ch of str) {
    const idx = NQ_ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return new Uint8Array(bytes)
}

function luhnChecksum(str) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let factor = 1, sum = 0, n = alphabet.length
  for (let i = str.length - 1; i >= 0; i--) {
    let addend = factor * alphabet.indexOf(str[i])
    factor = factor === 2 ? 1 : 2
    addend = Math.floor(addend / n) + (addend % n)
    sum += addend
  }
  return (n - (sum % n)) % n
}

export function addressBytesToNq(bytes20) {
  const hex    = Array.from(bytes20).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  const b32    = toBase32(bytes20).padStart(32, '0')
  const check  = String(luhnChecksum('NQ00' + b32)).padStart(2, '0')
  const groups = b32.match(/.{1,4}/g).join(' ')
  return `NQ${check} ${groups}`
}

export function nqToAddressBytes(nq) {
  const clean = nq.replace(/\s/g, '').slice(4)  // strip "NQxx"
  return fromBase32(clean).slice(0, 20)
}

export async function derivePostAddress(authorAddressBytes20, postIdBytes8) {
  const salt = new TextEncoder().encode('nimfeed')
  const seed = new Uint8Array(20 + 8 + salt.length)
  seed.set(authorAddressBytes20, 0)
  seed.set(postIdBytes8, 20)
  seed.set(salt, 28)
  const hash = await crypto.subtle.digest('SHA-256', seed)
  return new Uint8Array(hash).slice(0, 20)
}
```

- [ ] **Step 6: Run tests — expect pass**

```bash
npm test tests/protocol/utils.test.js tests/protocol/address.test.js
```

- [ ] **Step 7: Commit**

```bash
git add src/protocol/utils.js src/protocol/address.js tests/protocol/
git commit -m "feat: protocol utils and address derivation (TDD)"
```

---

## Task 3: Protocol — Constants, Encoder, Decoder

**Files:** `src/protocol/constants.js`, `src/protocol/encoder.js`, `src/protocol/decoder.js`, `tests/protocol/encoder.test.js`, `tests/protocol/decoder.test.js`

- [ ] **Step 1: Create src/protocol/constants.js**

```javascript
export const MAGIC         = new Uint8Array([0x4e, 0x46])  // "NF"
export const VERSION       = 0x01

// Replace with real testnet/mainnet addresses before deployment
export const POST_CATALOG_ADDRESS   = 'NQ00 0000 0000 0000 0000 0000 0000 0000 POST'
export const FOLLOW_CATALOG_ADDRESS = 'NQ00 0000 0000 0000 0000 0000 0000 0FLWW'

export const TYPES = {
  PROFILE_CLAIM: 0x01,
  POST_INLINE:   0x02,
  POST_START:    0x03,
  POST_CHUNK:    0x04,
  FOLLOW:        0x05,
  UNFOLLOW:      0x06,
}

export const TX_VALUE_LUNA  = 1     // 1 Luna per tx
export const FEED_PAGE_SIZE = 20
export const CHUNK_DATA_SIZE = 50
export const INLINE_MAX_NO_REPLY = 51
export const INLINE_MAX_WITH_REPLY = 23
```

- [ ] **Step 2: Write failing encoder tests**

Create `tests/protocol/encoder.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import {
  buildProfileClaim,
  buildPostInline,
  buildPostStart,
  buildPostChunk,
} from '../../src/protocol/encoder.js'
import { TYPES } from '../../src/protocol/constants.js'

const HEADER_SIZE = 4

function header(bytes) { return { magic: bytes.slice(0, 2), version: bytes[2], type: bytes[3] } }

describe('buildProfileClaim', () => {
  it('produces 64-byte payload with correct header', () => {
    const bytes = buildProfileClaim('alice', 'Alice A')
    expect(bytes.byteLength).toBe(64)
    const h = header(bytes)
    expect(h.magic).toEqual(new Uint8Array([0x4e, 0x46]))
    expect(h.version).toBe(0x01)
    expect(h.type).toBe(TYPES.PROFILE_CLAIM)
  })

  it('null-terminates username at byte 35', () => {
    const bytes = buildProfileClaim('alice', 'Alice')
    // username field is bytes [4-35] = 32 bytes
    const usernameField = bytes.slice(4, 36)
    // 'alice' = 5 chars; byte 9 should be 0x00
    expect(usernameField[5]).toBe(0x00)
  })

  it('normalizes username to lowercase', () => {
    const bytes = buildProfileClaim('ALICE', 'Alice')
    const username = new TextDecoder().decode(bytes.slice(4, 9))
    expect(username).toBe('alice')
  })
})

describe('buildPostInline', () => {
  it('produces 64-byte payload', () => {
    const bytes = buildPostInline(new Uint8Array(8), 'hello')
    expect(bytes.byteLength).toBe(64)
    expect(bytes[3]).toBe(TYPES.POST_INLINE)
  })

  it('sets is_reply flag correctly', () => {
    const noReply = buildPostInline(new Uint8Array(8), 'hi')
    expect(noReply[12] & 0x01).toBe(0)

    const replyAuthor = new Uint8Array(20).fill(1)
    const replyPostId = new Uint8Array(8).fill(2)
    const withReply = buildPostInline(new Uint8Array(8), 'hi', { replyAuthor, replyPostId })
    expect(withReply[12] & 0x01).toBe(1)
  })
})

describe('buildPostStart', () => {
  it('produces 64-byte payload with total_chunks', () => {
    const postId     = new Uint8Array(8).fill(7)
    const hash       = new Uint8Array(8).fill(0xff)
    const bytes      = buildPostStart(postId, 3, false, hash)
    expect(bytes.byteLength).toBe(64)
    expect(bytes[3]).toBe(TYPES.POST_START)
    expect(bytes[12]).toBe(3)  // total_chunks
  })

  it('sets compressed flag in byte 13', () => {
    const postId = new Uint8Array(8)
    const hash   = new Uint8Array(8)
    const noComp = buildPostStart(postId, 1, false, hash)
    const comp   = buildPostStart(postId, 1, true, hash)
    expect(noComp[13] & 0x01).toBe(0)
    expect(comp[13] & 0x01).toBe(1)
  })
})

describe('buildPostChunk', () => {
  it('produces 64-byte payload with chunk_index and data_len', () => {
    const postId = new Uint8Array(8).fill(9)
    const data   = new Uint8Array(30).fill(0xaa)
    const bytes  = buildPostChunk(postId, 2, data)
    expect(bytes.byteLength).toBe(64)
    expect(bytes[3]).toBe(TYPES.POST_CHUNK)
    expect(bytes[12]).toBe(2)   // chunk_index
    expect(bytes[13]).toBe(30)  // data_len
    expect(bytes.slice(14, 44)).toEqual(data)
  })
})
```

- [ ] **Step 3: Run — expect failure**

```bash
npm test tests/protocol/encoder.test.js
```

- [ ] **Step 4: Create src/protocol/encoder.js**

```javascript
import { MAGIC, VERSION, TYPES, CHUNK_DATA_SIZE } from './constants.js'
import { normalizeUsername } from './utils.js'

function makePayload(type) {
  const buf = new Uint8Array(64)
  buf[0] = MAGIC[0]; buf[1] = MAGIC[1]
  buf[2] = VERSION
  buf[3] = type
  return buf
}

function writeNullTerminated(buf, offset, maxLen, str) {
  const encoded = new TextEncoder().encode(str).slice(0, maxLen - 1)
  buf.set(encoded, offset)
  // remaining bytes stay 0 (null terminator)
}

export function buildProfileClaim(username, displayName) {
  const buf = makePayload(TYPES.PROFILE_CLAIM)
  const normalized = normalizeUsername(username) ?? username.toLowerCase().slice(0, 31)
  writeNullTerminated(buf, 4,  32, normalized)   // [4-35]
  writeNullTerminated(buf, 36, 24, displayName)  // [36-59]
  return buf
}

export function buildPostInline(postIdBytes8, text, reply = null) {
  const buf = makePayload(TYPES.POST_INLINE)
  buf.set(postIdBytes8, 4)
  if (reply) {
    buf[12] = 0x01  // is_reply flag
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
    const view = new DataView(buf.buffer)
    // reply_to_post_id as LE uint64: store low 4 bytes
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
```

- [ ] **Step 5: Write failing decoder tests**

Create `tests/protocol/decoder.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { parseTransaction } from '../../src/protocol/decoder.js'
import { buildProfileClaim, buildPostInline, buildPostStart, buildPostChunk } from '../../src/protocol/encoder.js'
import { bytesToHex } from '../../src/protocol/utils.js'
import { POST_CATALOG_ADDRESS } from '../../src/protocol/constants.js'

function mockTx(payload, to = POST_CATALOG_ADDRESS) {
  return { hash: 'abc', from: 'NQ01SENDER', to, data: bytesToHex(payload), blockHeight: 100, transactionIndex: 0, timestamp: 0 }
}

describe('parseTransaction', () => {
  it('returns null for non-NF magic', () => {
    const tx = mockTx(new Uint8Array([0x00, 0x00, 0x01, 0x01]))
    expect(parseTransaction(tx)).toBeNull()
  })

  it('parses PROFILE_CLAIM', () => {
    const tx = mockTx(buildProfileClaim('bob', 'Bob B'))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('PROFILE_CLAIM')
    expect(ev.username).toBe('bob')
    expect(ev.displayName).toBe('Bob B')
    expect(ev.from).toBe('NQ01SENDER')
  })

  it('parses POST_INLINE without reply', () => {
    const postId = new Uint8Array(8).fill(1)
    const tx = mockTx(buildPostInline(postId, 'hello world'))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_INLINE')
    expect(ev.text).toBe('hello world')
    expect(ev.isReply).toBe(false)
  })

  it('parses POST_START', () => {
    const postId = new Uint8Array(8).fill(2)
    const hash   = new Uint8Array(8).fill(0xab)
    const tx = mockTx(buildPostStart(postId, 3, true, hash))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_START')
    expect(ev.totalChunks).toBe(3)
    expect(ev.compressed).toBe(true)
    expect(ev.contentHash).toHaveLength(16)
  })

  it('parses POST_CHUNK', () => {
    const postId = new Uint8Array(8).fill(3)
    const data   = new Uint8Array(30).fill(0xcc)
    const tx = mockTx(buildPostChunk(postId, 1, data), 'NQ_DERIVED')
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_CHUNK')
    expect(ev.chunkIndex).toBe(1)
    expect(ev.dataLen).toBe(30)
  })
})
```

- [ ] **Step 6: Create src/protocol/decoder.js**

```javascript
import { TYPES } from './constants.js'
import { hexToBytes, trimNulls, postIdToHex } from './utils.js'
import { addressBytesToNq } from './address.js'

const MAGIC_HEX = '4e46'

export function parseTransaction(tx) {
  const hex = tx.data
  if (!hex || hex.length < 8) return null
  if (hex.slice(0, 4) !== MAGIC_HEX) return null

  const bytes   = hexToBytes(hex)
  const version = bytes[2]
  const type    = bytes[3]
  if (version !== 0x01) return null

  const base = {
    from:        tx.from,
    to:          tx.to,
    blockHeight: tx.blockHeight,
    txIndex:     tx.transactionIndex,
    txHash:      tx.hash,
  }

  switch (type) {
    case TYPES.PROFILE_CLAIM:  return decodeProfileClaim(base, bytes)
    case TYPES.POST_INLINE:    return decodePostInline(base, bytes)
    case TYPES.POST_START:     return decodePostStart(base, bytes)
    case TYPES.POST_CHUNK:     return decodePostChunk(base, bytes)
    case TYPES.FOLLOW:         return decodeFollowUnfollow(base, bytes, 'FOLLOW')
    case TYPES.UNFOLLOW:       return decodeFollowUnfollow(base, bytes, 'UNFOLLOW')
    default:                   return null
  }
}

function readNullTerminated(bytes, offset, maxLen) {
  return new TextDecoder().decode(trimNulls(bytes.slice(offset, offset + maxLen)))
}

function decodeProfileClaim(base, bytes) {
  const username    = readNullTerminated(bytes, 4, 32)
  const displayName = readNullTerminated(bytes, 36, 24)
  return { ...base, event: 'PROFILE_CLAIM', username, displayName }
}

function decodePostInline(base, bytes) {
  const postId  = postIdToHex(bytes.slice(4, 12))
  const flags   = bytes[12]
  const isReply = !!(flags & 0x01)
  let replyToAuthor = null, replyToPostId = null, text
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
  const postId       = postIdToHex(bytes.slice(4, 12))
  const totalChunks  = bytes[12]
  const flags        = bytes[13]
  const compressed   = !!(flags & 0x01)
  const isReply      = !!(flags & 0x02)
  const contentHash  = Array.from(bytes.slice(14, 22)).map(b => b.toString(16).padStart(2, '0')).join('')
  let replyToAuthor = null, replyToPostId = null
  if (isReply) {
    replyToAuthor = addressBytesToNq(bytes.slice(22, 42))
    replyToPostId = postIdToHex(bytes.slice(42, 50))
  }
  return { ...base, event: 'POST_START', postId, totalChunks, compressed, contentHash, isReply, replyToAuthor, replyToPostId }
}

function decodePostChunk(base, bytes) {
  const postId     = postIdToHex(bytes.slice(4, 12))
  const chunkIndex = bytes[12]
  const dataLen    = bytes[13]
  const data       = bytes.slice(14, 14 + dataLen)
  return { ...base, event: 'POST_CHUNK', postId, chunkIndex, dataLen, data }
}

function decodeFollowUnfollow(base, bytes, event) {
  const targetAddress = addressBytesToNq(bytes.slice(4, 24))
  return { ...base, event, targetAddress }
}
```

- [ ] **Step 7: Run all protocol tests**

```bash
npm test tests/protocol/
```

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add src/protocol/ tests/protocol/
git commit -m "feat: protocol constants, encoder, decoder (TDD)"
```

---

## Task 4: Compression

**Files:** `src/protocol/compression.js`, `tests/protocol/compression.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/protocol/compression.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { deflateRaw, inflateRaw, isCompressionSupported } from '../../src/protocol/compression.js'

describe('compression', () => {
  it('isCompressionSupported returns boolean', () => {
    expect(typeof isCompressionSupported()).toBe('boolean')
  })

  it('round-trips text through deflate/inflate', async () => {
    const original = new TextEncoder().encode('Hello, NimFeed! '.repeat(10))
    const compressed = await deflateRaw(original)
    const restored = await inflateRaw(compressed)
    expect(restored).toEqual(original)
  })

  it('compressed output is smaller for repetitive input', async () => {
    const original = new TextEncoder().encode('aaa'.repeat(100))
    const compressed = await deflateRaw(original)
    expect(compressed.length).toBeLessThan(original.length)
  })
})
```

- [ ] **Step 2: Create src/protocol/compression.js**

```javascript
export function isCompressionSupported() {
  try {
    new CompressionStream('deflate-raw')
    return true
  } catch { return false }
}

export async function deflateRaw(bytes) {
  if (!isCompressionSupported()) return bytes
  const cs     = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  const reader = cs.readable.getReader()
  writer.write(bytes)
  writer.close()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

export async function inflateRaw(bytes) {
  const ds     = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  const reader = ds.readable.getReader()
  writer.write(bytes)
  writer.close()
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

export function shouldCompress(raw, compressed) {
  return compressed.length < raw.length
}
```

- [ ] **Step 3: Run and commit**

```bash
npm test tests/protocol/compression.test.js
git add src/protocol/compression.js tests/protocol/compression.test.js
git commit -m "feat: deflate-raw compression with graceful fallback"
```

---

## Task 5: Database Schema

**Files:** `src/db/schema.js`, `src/db/queries.js`, `tests/db/schema.test.js`

- [ ] **Step 1: Write failing schema tests**

Create `tests/db/schema.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('profile_claims store', () => {
  it('stores and retrieves a claim', async () => {
    await db.profile_claims.put({
      username: 'alice', address: 'NQ01A', display_name: 'Alice',
      block_height: 10, tx_index: 0, tx_hash: 'x'
    })
    const row = await db.profile_claims.get(['alice', 'NQ01A'])
    expect(row.display_name).toBe('Alice')
  })
})

describe('posts store', () => {
  it('stores inline post and retrieves by author', async () => {
    await db.posts.put({
      author: 'NQ01A', post_id: '0000000000000001', block_height: 10, tx_index: 0,
      content: 'hello', total_chunks: null, chunks_received: 0, compressed: false,
      content_hash: null, is_inline: true, is_reply: false,
      reply_to_author: null, reply_to_post_id: null,
      status: 'inline', first_seen_at: 10
    })
    const posts = await db.posts.where('author').equals('NQ01A').toArray()
    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBe('hello')
  })
})
```

- [ ] **Step 2: Create src/db/schema.js**

```javascript
import Dexie from 'dexie'

export const db = new Dexie('nimfeed-v1')

db.version(1).stores({
  profile_claims: '[username+address], username, address',
  users:          'address, username',
  posts:          '[author+post_id], block_height, author, status, [reply_to_author+reply_to_post_id]',
  post_chunks:    '[author+post_id+chunk_index]',
  catalog_refs:   'tx_hash, type, sender, [type+block_height+tx_index], [sender+type]',
  follows:        '[follower+followee], follower, followee',
  sync_state:     'scope_key',
})
```

- [ ] **Step 3: Create src/db/queries.js**

```javascript
import { db } from './schema.js'

// Profile claims
export const putProfileClaim = (claim) => db.profile_claims.put(claim)

export async function getWinningClaim(username) {
  const claims = await db.profile_claims.where('username').equals(username).toArray()
  if (!claims.length) return null
  return claims.sort((a, b) =>
    a.block_height - b.block_height || a.tx_index - b.tx_index
  )[0]
}

export async function getLatestClaimByAddress(address, username) {
  const claims = await db.profile_claims
    .where('address').equals(address).toArray()
  const forUsername = claims.filter(c => c.username === username)
  if (!forUsername.length) return null
  return forUsername.sort((a, b) =>
    b.block_height - a.block_height || b.tx_index - a.tx_index
  )[0]
}

export async function searchUsernames(query) {
  if (!query || query.length < 2) return []
  const normalized = query.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!normalized) return []
  const all = await db.profile_claims
    .where('username').startsWith(normalized).toArray()
  const winners = new Map()
  for (const claim of all) {
    const existing = winners.get(claim.username)
    if (!existing ||
        claim.block_height < existing.block_height ||
        (claim.block_height === existing.block_height && claim.tx_index < existing.tx_index)) {
      winners.set(claim.username, claim)
    }
  }
  return [...winners.values()].slice(0, 20)
}

// Users
export const getUser    = (address) => db.users.get(address)
export const putUser    = (user) => db.users.put(user)
export const updateUser = (address, changes) => db.users.update(address, changes)

// Posts
export const getPost    = (author, postId) => db.posts.get([author, postId])
export const putPost    = (post) => db.posts.put(post)
export const updatePost = (author, postId, changes) => db.posts.update([author, postId], changes)

export async function getPostsByAuthor(author) {
  return db.posts.where('author').equals(author)
    .filter(p => p.status === 'complete' || p.status === 'inline')
    .toArray()
}

export async function getReplies(replyToAuthor, replyToPostId) {
  return db.posts
    .where('[reply_to_author+reply_to_post_id]')
    .equals([replyToAuthor, replyToPostId])
    .filter(p => p.status === 'complete' || p.status === 'inline')
    .toArray()
}

// Post chunks
export const putChunk = (chunk) => db.post_chunks.put(chunk)

// Catalog refs
export const putCatalogRef = (ref) => db.catalog_refs.put(ref)

export async function getCatalogRefs(types, { limit = 20, beforeHeight = Infinity, beforeTxIndex = Infinity } = {}) {
  const typeArray = Array.isArray(types) ? types : [types]
  const all = await db.catalog_refs
    .where('type').anyOf(typeArray)
    .filter(r =>
      r.block_height < beforeHeight ||
      (r.block_height === beforeHeight && r.tx_index < beforeTxIndex)
    )
    .reverse()
    .sortBy('block_height')
  // reverse sort to get DESC order
  return all.sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)
    .slice(0, limit)
}

export async function getCatalogRefsBySender(sender, types) {
  const typeArray = Array.isArray(types) ? types : [types]
  return db.catalog_refs
    .where('sender').equals(sender)
    .filter(r => typeArray.includes(r.type))
    .toArray()
}

// Sync state
export const getSyncState  = (scopeKey) => db.sync_state.get(scopeKey)
export const putSyncState  = (state) => db.sync_state.put(state)
export const updateSyncState = (scopeKey, changes) => db.sync_state.update(scopeKey, changes)
```

- [ ] **Step 4: Run and commit**

```bash
npm test tests/db/schema.test.js
git add src/db/ tests/db/
git commit -m "feat: IndexedDB schema and query helpers"
```

---

## Task 6: Indexer — Handlers and Assembler

**Files:** `src/indexer/handlers.js`, `src/indexer/assembler.js`, `tests/indexer/assembler.test.js`

- [ ] **Step 1: Write assembler tests**

Create `tests/indexer/assembler.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { tryAssemble } from '../../src/indexer/assembler.js'
import { deflateRaw } from '../../src/protocol/compression.js'

beforeEach(async () => { await db.delete(); await db.open() })

async function putPost(author, postId, totalChunks, compressed, contentHash) {
  await db.posts.put({
    author, post_id: postId, block_height: 1, tx_index: 0,
    content: null, total_chunks: totalChunks, chunks_received: 0,
    compressed, content_hash: contentHash, is_inline: false,
    is_reply: false, reply_to_author: null, reply_to_post_id: null,
    status: 'pending', first_seen_at: 1
  })
}

async function putChunk(author, postId, index, data) {
  await db.post_chunks.put({ author, post_id: postId, chunk_index: index, data, data_len: data.length })
  await db.posts.update([author, postId], { chunks_received: index + 1 })
}

describe('tryAssemble', () => {
  it('assembles single-chunk post', async () => {
    const raw       = new TextEncoder().encode('hello world')
    const digest    = await crypto.subtle.digest('SHA-256', raw)
    const hash8     = Array.from(new Uint8Array(digest).slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('')

    await putPost('NQ01A', '0000000000000001', 1, false, hash8)
    await putChunk('NQ01A', '0000000000000001', 0, raw)

    await tryAssemble('NQ01A', '0000000000000001')

    const post = await db.posts.get(['NQ01A', '0000000000000001'])
    expect(post.status).toBe('complete')
    expect(post.content).toBe('hello world')
  })

  it('marks invalid_hash when hash mismatches', async () => {
    const raw    = new TextEncoder().encode('hello')
    const hash8  = '0000000000000000'

    await putPost('NQ01B', '0000000000000002', 1, false, hash8)
    await putChunk('NQ01B', '0000000000000002', 0, raw)

    await tryAssemble('NQ01B', '0000000000000002')

    const post = await db.posts.get(['NQ01B', '0000000000000002'])
    expect(post.status).toBe('invalid_hash')
  })

  it('does nothing if not all chunks received', async () => {
    await putPost('NQ01C', '0000000000000003', 3, false, '0'.repeat(16))
    await putChunk('NQ01C', '0000000000000003', 0, new Uint8Array(10))

    await tryAssemble('NQ01C', '0000000000000003')

    const post = await db.posts.get(['NQ01C', '0000000000000003'])
    expect(post.status).toBe('pending')
  })
})
```

- [ ] **Step 2: Create src/indexer/assembler.js**

```javascript
import { db } from '../db/schema.js'
import { inflateRaw } from '../protocol/compression.js'
import { hexToBytes } from '../protocol/utils.js'

export async function tryAssemble(author, postId) {
  const post = await db.posts.get([author, postId])
  if (!post || post.total_chunks === null) return
  if (post.chunks_received < post.total_chunks) return

  const chunks = await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, postId, 0], [author, postId, 255])
    .toArray()

  chunks.sort((a, b) => a.chunk_index - b.chunk_index)

  const totalLen = chunks.reduce((s, c) => s + c.data_len, 0)
  const encoded  = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    encoded.set(c.data.slice(0, c.data_len), offset)
    offset += c.data_len
  }

  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const hash8  = new Uint8Array(digest).slice(0, 8)
  const expected = hexToBytes(post.content_hash)

  if (!bytesEqual(hash8, expected)) {
    await db.posts.update([author, postId], { status: 'invalid_hash' })
    return
  }

  const payload = post.compressed ? await inflateRaw(encoded) : encoded
  const content = new TextDecoder().decode(payload)

  await db.posts.update([author, postId], { status: 'complete', content })
  await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, postId, 0], [author, postId, 255])
    .delete()
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
```

- [ ] **Step 3: Create src/indexer/handlers.js**

```javascript
import { POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS, TYPES } from '../protocol/constants.js'
import { parseTransaction } from '../protocol/decoder.js'
import { normalizeUsername } from '../protocol/utils.js'
import { nqToAddressBytes, addressBytesToNq, derivePostAddress } from '../protocol/address.js'
import {
  putProfileClaim, getWinningClaim, getLatestClaimByAddress, putUser, getUser, updateUser,
  putPost, getPost, updatePost, putChunk, putCatalogRef,
} from '../db/queries.js'
import { tryAssemble } from './assembler.js'

export async function processPostCatalogTx(tx) {
  if (tx.to !== POST_CATALOG_ADDRESS) return
  const ev = parseTransaction(tx)
  if (!ev) return

  switch (ev.event) {
    case 'PROFILE_CLAIM': await handleProfileClaim(ev); break
    case 'POST_INLINE':   await handlePostInline(ev);   break
    case 'POST_START':    await handlePostStart(ev);    break
  }
}

export async function processFollowCatalogTx(tx) {
  if (tx.to !== FOLLOW_CATALOG_ADDRESS) return
  const ev = parseTransaction(tx)
  if (!ev) return

  switch (ev.event) {
    case 'FOLLOW':   await handleFollow(ev); break
    case 'UNFOLLOW': await handleFollow(ev); break
  }
}

export async function processDerivedAddressTx(tx, expectedNq) {
  if (tx.to !== expectedNq) return
  const ev = parseTransaction(tx)
  if (!ev || ev.event !== 'POST_CHUNK') return
  await handlePostChunk(ev)
}

async function handleProfileClaim(ev) {
  const username = normalizeUsername(ev.username)
  if (!username) return

  await putProfileClaim({
    username,
    address:      ev.from,
    display_name: ev.displayName,
    block_height: ev.blockHeight,
    tx_index:     ev.txIndex,
    tx_hash:      ev.txHash,
  })

  await putCatalogRef({
    tx_hash:      ev.txHash,
    type:         'PROFILE_CLAIM',
    sender:       ev.from,
    post_id:      null,
    username,
    block_height: ev.blockHeight,
    tx_index:     ev.txIndex,
    seen_at:      Date.now(),
  })

  // Update users cache
  const winning = await getWinningClaim(username)
  if (winning?.address === ev.from) {
    const latest = await getLatestClaimByAddress(ev.from, username)
    await putUser({
      address:           ev.from,
      display_name:      latest?.display_name ?? null,
      username,
      username_height:   winning.block_height,
      username_tx_index: winning.tx_index,
      last_synced_height: ev.blockHeight,
    })
  }
}

async function handlePostInline(ev) {
  await putPost({
    author:           ev.from,
    post_id:          ev.postId,
    block_height:     ev.blockHeight,
    tx_index:         ev.txIndex,
    content:          ev.text,
    total_chunks:     null,
    chunks_received:  0,
    compressed:       false,
    content_hash:     null,
    is_inline:        true,
    is_reply:         ev.isReply,
    reply_to_author:  ev.replyToAuthor,
    reply_to_post_id: ev.replyToPostId,
    status:           'inline',
    first_seen_at:    ev.blockHeight,
  })

  await putCatalogRef({
    tx_hash:      ev.txHash,
    type:         'POST_INLINE',
    sender:       ev.from,
    post_id:      ev.postId,
    username:     null,
    block_height: ev.blockHeight,
    tx_index:     ev.txIndex,
    seen_at:      Date.now(),
  })
}

async function handlePostStart(ev) {
  const existing = await getPost(ev.from, ev.postId)

  const record = {
    author:           ev.from,
    post_id:          ev.postId,
    block_height:     ev.blockHeight,
    tx_index:         ev.txIndex,
    content:          null,
    total_chunks:     ev.totalChunks,
    chunks_received:  existing?.chunks_received ?? 0,
    compressed:       ev.compressed,
    content_hash:     ev.contentHash,
    is_inline:        false,
    is_reply:         ev.isReply,
    reply_to_author:  ev.replyToAuthor,
    reply_to_post_id: ev.replyToPostId,
    status:           'pending',
    first_seen_at:    existing?.first_seen_at ?? ev.blockHeight,
  }

  await putPost(record)

  await putCatalogRef({
    tx_hash:      ev.txHash,
    type:         'POST_START',
    sender:       ev.from,
    post_id:      ev.postId,
    username:     null,
    block_height: ev.blockHeight,
    tx_index:     ev.txIndex,
    seen_at:      Date.now(),
  })

  await tryAssemble(ev.from, ev.postId)
}

async function handlePostChunk(ev) {
  // Validate sender matches author of post_id in catalog
  const existing = await getPost(ev.from, ev.postId)

  await putChunk({
    author:      ev.from,
    post_id:     ev.postId,
    chunk_index: ev.chunkIndex,
    data:        ev.data,
    data_len:    ev.dataLen,
  })

  if (existing) {
    await updatePost(ev.from, ev.postId, {
      chunks_received: (existing.chunks_received ?? 0) + 1,
    })
  } else {
    await putPost({
      author: ev.from, post_id: ev.postId, block_height: 0, tx_index: 0,
      content: null, total_chunks: null, chunks_received: 1,
      compressed: false, content_hash: null, is_inline: false,
      is_reply: false, reply_to_author: null, reply_to_post_id: null,
      status: 'pending', first_seen_at: 0,
    })
  }

  await tryAssemble(ev.from, ev.postId)
}

async function handleFollow(ev) {
  const { db } = await import('../db/schema.js')
  const key = [ev.from, ev.targetAddress]
  const existing = await db.follows.get(key)

  const isNewer = !existing ||
    ev.blockHeight > existing.block_height ||
    (ev.blockHeight === existing.block_height && ev.txIndex > existing.tx_index)

  if (!isNewer) return

  await db.follows.put({
    follower:     ev.from,
    followee:     ev.targetAddress,
    active:       ev.event === 'FOLLOW',
    block_height: ev.blockHeight,
    tx_index:     ev.txIndex,
  })
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/indexer/ tests/indexer/
git commit -m "feat: indexer handlers and chunk assembler (TDD)"
```

---

## Task 7: Indexer Service

**Files:** `src/indexer/IndexerService.js`, `src/indexer/useIndexer.js`

- [ ] **Step 1: Create src/indexer/IndexerService.js**

```javascript
import { POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS } from '../protocol/constants.js'
import { processPostCatalogTx, processFollowCatalogTx, processDerivedAddressTx } from './handlers.js'
import { getSyncState, putSyncState, updateSyncState } from '../db/queries.js'
import { addressBytesToNq, derivePostAddress, nqToAddressBytes } from '../protocol/address.js'
import { db } from '../db/schema.js'

const BATCH_SIZE = 2000

export class IndexerService extends EventTarget {
  constructor(rpc) {
    super()
    this.rpc = rpc
  }

  async syncPostCatalog() {
    await this._deltaSync('post_catalog', POST_CATALOG_ADDRESS, processPostCatalogTx.bind(null))
  }

  async syncFollowCatalog() {
    await this._deltaSync('follow_catalog', FOLLOW_CATALOG_ADDRESS, processFollowCatalogTx.bind(null))
  }

  async syncDerivedAddress(derivedNq, postAuthor, postId) {
    const scopeKey = `post:${derivedNq}`
    const state = await getSyncState(scopeKey)
    if (state?.fully_synced) return

    await this._fullSync(scopeKey, derivedNq, (tx) =>
      processDerivedAddressTx(tx, derivedNq)
    )
  }

  async startDeltaSync() {
    await this.syncPostCatalog()
    await this.syncFollowCatalog()

    // Trigger derived address sync for any pending posts
    const pending = await db.posts.where('status').equals('pending').toArray()
    for (const post of pending) {
      const authorBytes  = nqToAddressBytes(post.author)
      const postIdBytes  = hexToBytes(post.post_id)  // already big-endian hex
      const derivedBytes = await derivePostAddress(authorBytes, postIdBytes)
      const derivedNq    = addressBytesToNq(derivedBytes)
      this.syncDerivedAddress(derivedNq, post.author, post.post_id).catch(() => {})
    }

    this.dispatchEvent(new Event('catalog:updated'))
  }

  async _deltaSync(scopeKey, address, handler) {
    const state    = await getSyncState(scopeKey)
    const stopHash = state?.newest_seen_tx_hash ?? null

    const txs = await this.rpc.getTransactionsByAddress(address, 500)
    if (!txs.length) return

    const toProcess = []
    for (const raw of txs) {
      if (raw.hash === stopHash) break
      toProcess.push(raw)
    }

    await this._processBatch(toProcess, handler)

    await putSyncState({
      scope_key:            scopeKey,
      newest_seen_tx_hash:  txs[0].hash,
      oldest_synced_cursor: state?.oldest_synced_cursor ?? txs[txs.length - 1].hash,
      fully_synced:         txs.length < 500,
      last_synced_at:       Date.now(),
    })
  }

  async _fullSync(scopeKey, address, handler) {
    let cursor = null
    while (true) {
      const txs = await this.rpc.getTransactionsByAddress(address, 500, cursor)
      if (!txs.length) break
      await this._processBatch(txs, handler)
      cursor = txs[txs.length - 1].hash
      if (txs.length < 500) {
        await putSyncState({ scope_key: scopeKey, fully_synced: true, last_synced_at: Date.now() })
        break
      }
    }
  }

  async _processBatch(txs, handler) {
    let count = 0
    for (const raw of txs) {
      await handler(this.rpc.normalizeTransaction(raw))
      count++
      if (count % BATCH_SIZE === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
    }
  }
}

function hexToBytes(hex16) {
  // hex16 is big-endian stored post_id — convert back to 8 LE bytes for address derivation
  const reversed = []
  for (let i = 0; i < 16; i += 2) reversed.unshift(parseInt(hex16.slice(i, i + 2), 16))
  return new Uint8Array(reversed)
}
```

- [ ] **Step 2: Create src/indexer/useIndexer.js**

```javascript
import { inject, provide } from 'vue'
import { IndexerService } from './IndexerService.js'

const INDEXER_KEY = Symbol('indexer')

export function provideIndexer(rpc) {
  const indexer = new IndexerService(rpc)
  provide(INDEXER_KEY, indexer)
  return indexer
}

export function useIndexer() {
  return inject(INDEXER_KEY)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/indexer/IndexerService.js src/indexer/useIndexer.js
git commit -m "feat: IndexerService singleton — catalog + derived address sync"
```

---

## Task 8: Chain — RPC and Hub

**Files:** `src/chain/rpc.js`, `src/chain/hub.js`

- [ ] **Step 1: Create src/chain/rpc.js**

```javascript
export class NimiqRPC {
  constructor(url = 'https://rpc.nimiq-testnet.com') {
    this.url = url
    this._id = 0
  }

  async _call(method, params = []) {
    const res = await fetch(this.url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: ++this._id, method, params }),
    })
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(json.error.message)
    return json.result
  }

  normalizeTransaction(raw) {
    return {
      hash:             raw.hash,
      from:             raw.sender    ?? raw.from,
      to:               raw.recipient ?? raw.to,
      value:            raw.value,
      data:             raw.data ?? raw.extraData ?? '',
      blockHeight:      raw.blockNumber ?? raw.blockHeight ?? 0,
      transactionIndex: raw.transactionIndex ?? 0,
      timestamp:        raw.timestamp ?? 0,
    }
  }

  async getTransactionsByAddress(address, limit = 500, startAt = null) {
    const params = [address, limit]
    if (startAt) params.push(startAt)
    const result = await this._call('getTransactionsByAddress', params)
    return (result ?? []).map(r => this.normalizeTransaction(r))
  }

  async getTransactionByHash(hash) {
    const result = await this._call('getTransactionByHash', [hash])
    return result ? this.normalizeTransaction(result) : null
  }

  async getBlockNumber() {
    return this._call('blockNumber', [])
  }

  async sendRawTransaction(serializedHex) {
    return this._call('sendRawTransaction', [serializedHex])
  }
}

export const rpc = new NimiqRPC()
```

- [ ] **Step 2: Create src/chain/hub.js**

```javascript
import HubApi from '@nimiq/hub-api'

let _hub = null

function getHub() {
  if (!_hub) _hub = new HubApi('https://hub.nimiq-testnet.com')
  return _hub
}

export function useHub() {
  const hub = getHub()

  async function login() {
    const result = await hub.checkout({
      appName: 'NimFeed',
      request: {
        kind: 'checkout',
        version: 2,
        currency: 'NIM',
        callbackUrl: window.location.href,
        fiatCurrency: 'USD',
        fiatAmount: 0,
        items: [{ label: 'NimFeed login', amount: 0 }],
      },
    })
    return result
  }

  async function getAddress() {
    const accs = await hub.list({ appName: 'NimFeed' })
    return accs?.[0]?.addresses?.[0] ?? null
  }

  async function signTransaction(txParams) {
    return hub.signTransaction({
      appName: 'NimFeed',
      ...txParams,
    })
  }

  // Warmup the Hub iframe early to reduce popup delay
  function warmup() {
    try { hub.checkRedirectResponse() } catch {}
  }

  return { login, getAddress, signTransaction, warmup }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/chain/
git commit -m "feat: RPC client and Hub composable"
```

---

## Task 9: Stores

**Files:** `src/stores/auth.js`, `src/stores/feed.js`, `src/stores/ui.js`

- [ ] **Step 1: Create src/stores/auth.js**

```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUser } from '../db/queries.js'

export const useAuthStore = defineStore('auth', () => {
  const address     = ref(localStorage.getItem('nimfeed_address') ?? null)
  const displayName = ref(null)
  const username    = ref(null)
  const hasClaimed  = ref(false)

  const isLoggedIn = computed(() => !!address.value)

  function setAddress(addr) {
    address.value = addr
    if (addr) localStorage.setItem('nimfeed_address', addr)
    else localStorage.removeItem('nimfeed_address')
  }

  async function loadProfile() {
    if (!address.value) return
    const user = await getUser(address.value)
    if (user) {
      displayName.value = user.display_name
      username.value    = user.username
      hasClaimed.value  = !!user.username
    }
  }

  function logout() {
    setAddress(null)
    displayName.value = null
    username.value    = null
    hasClaimed.value  = false
  }

  return { address, displayName, username, hasClaimed, isLoggedIn, setAddress, loadProfile, logout }
})
```

- [ ] **Step 2: Create src/stores/feed.js**

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFeedStore = defineStore('feed', () => {
  const posts   = ref([])
  const loading = ref(false)
  const hasMore = ref(true)

  function appendPosts(newPosts) {
    posts.value.push(...newPosts)
    if (posts.value.length > 50) posts.value = posts.value.slice(0, 50)
  }

  function clear() {
    posts.value = []
    hasMore.value = true
  }

  return { posts, loading, hasMore, appendPosts, clear }
})
```

- [ ] **Step 3: Create src/stores/ui.js**

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const loginModalOpen    = ref(false)
  const composerOpen      = ref(false)
  const filterNoClaim     = ref(true)    // hide posts from unclaimed addresses
  const filterMinAgBlocks = ref(10)

  return { loginModalOpen, composerOpen, filterNoClaim, filterMinAgBlocks }
})
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/
git commit -m "feat: Pinia stores — auth, feed, ui"
```

---

## Task 10: Composables

**Files:** `src/composables/usePost.js`, `src/composables/useFeed.js`, `src/composables/useProfile.js`

- [ ] **Step 1: Create src/composables/usePost.js**

```javascript
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useHub } from '../chain/hub.js'
import { rpc } from '../chain/rpc.js'
import { buildProfileClaim, buildPostInline, buildPostStart, buildPostChunk, splitInto50ByteChunks } from '../protocol/encoder.js'
import { generatePostId, postIdToHex } from '../protocol/utils.js'
import { nqToAddressBytes, addressBytesToNq, derivePostAddress } from '../protocol/address.js'
import { deflateRaw, shouldCompress } from '../protocol/compression.js'
import { POST_CATALOG_ADDRESS, TX_VALUE_LUNA, INLINE_MAX_NO_REPLY, INLINE_MAX_WITH_REPLY } from '../protocol/constants.js'
import { putPost } from '../db/queries.js'

export function usePost() {
  const auth    = useAuthStore()
  const hub     = useHub()
  const sending = ref(false)
  const error   = ref(null)

  async function claimProfile(username, displayName) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const payload = buildProfileClaim(username, displayName)
    const signed  = await hub.signTransaction({
      sender:    auth.address,
      recipient: POST_CATALOG_ADDRESS,
      value:     TX_VALUE_LUNA,
      fee:       0,
      extraData: payload,
    })
    await rpc.sendRawTransaction(signed.serializedTx)
  }

  function txCount(text, isReply) {
    const raw    = new TextEncoder().encode(text)
    const limit  = isReply ? INLINE_MAX_WITH_REPLY : INLINE_MAX_NO_REPLY
    if (raw.length <= limit) return 1
    // Estimate chunks (compression varies); show conservative upper bound
    const chunks = Math.ceil(raw.length / 50) + 1
    return 1 + chunks
  }

  async function submitPost(text, { replyToAuthor = null, replyToPostId = null } = {}) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    if (sending.value) return
    sending.value = true
    error.value   = null

    try {
      const raw    = new TextEncoder().encode(text)
      const isReply = !!(replyToAuthor && replyToPostId)
      const limit  = isReply ? INLINE_MAX_WITH_REPLY : INLINE_MAX_NO_REPLY

      if (raw.length <= limit) {
        await _submitInline(text, isReply, replyToAuthor, replyToPostId)
      } else {
        await _submitChunked(text, raw, isReply, replyToAuthor, replyToPostId)
      }
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      sending.value = false
    }
  }

  async function _submitInline(text, isReply, replyToAuthor, replyToPostId) {
    const postIdBytes = generatePostId()
    const replyOpts   = isReply ? {
      replyAuthor: nqToAddressBytes(replyToAuthor),
      replyPostId: hexToPostIdBytes(replyToPostId),
    } : null
    const payload = buildPostInline(postIdBytes, text, replyOpts)

    const signed = await hub.signTransaction({
      sender: auth.address, recipient: POST_CATALOG_ADDRESS,
      value: TX_VALUE_LUNA, fee: 0, extraData: payload,
    })

    const postIdHex = postIdToHex(postIdBytes)
    await putPost({
      author: auth.address, post_id: postIdHex, block_height: 0, tx_index: 0,
      content: text, total_chunks: null, chunks_received: 0, compressed: false,
      content_hash: null, is_inline: true, is_reply: isReply,
      reply_to_author: replyToAuthor, reply_to_post_id: replyToPostId,
      status: 'inline', first_seen_at: 0,
    })

    await rpc.sendRawTransaction(signed.serializedTx)
  }

  async function _submitChunked(text, raw, isReply, replyToAuthor, replyToPostId) {
    const comp    = await deflateRaw(raw)
    const payload = shouldCompress(raw, comp) ? comp : raw
    const compressed = payload === comp

    const digest      = await crypto.subtle.digest('SHA-256', payload)
    const contentHash = new Uint8Array(digest).slice(0, 8)
    const chunks      = splitInto50ByteChunks(payload)

    const postIdBytes   = generatePostId()
    const postIdHex     = postIdToHex(postIdBytes)
    const authorBytes   = nqToAddressBytes(auth.address)
    const derivedBytes  = await derivePostAddress(authorBytes, postIdBytes)
    const derivedNq     = addressBytesToNq(derivedBytes)

    const replyOpts = isReply ? {
      replyAuthor: nqToAddressBytes(replyToAuthor),
      replyPostId: hexToPostIdBytes(replyToPostId),
    } : null

    const hashHex = Array.from(contentHash).map(b => b.toString(16).padStart(2, '0')).join('')

    const startPayload = buildPostStart(postIdBytes, chunks.length, compressed, contentHash, replyOpts)
    const startSigned  = await hub.signTransaction({
      sender: auth.address, recipient: POST_CATALOG_ADDRESS,
      value: TX_VALUE_LUNA, fee: 0, extraData: startPayload,
    })

    const chunkSigneds = []
    for (let i = 0; i < chunks.length; i++) {
      const chunkPayload = buildPostChunk(postIdBytes, i, chunks[i])
      const signed = await hub.signTransaction({
        sender: auth.address, recipient: derivedNq,
        value: TX_VALUE_LUNA, fee: 0, extraData: chunkPayload,
      })
      chunkSigneds.push(signed)
    }

    await putPost({
      author: auth.address, post_id: postIdHex, block_height: 0, tx_index: 0,
      content: text, total_chunks: chunks.length, chunks_received: 0,
      compressed, content_hash: hashHex, is_inline: false, is_reply: isReply,
      reply_to_author: replyToAuthor, reply_to_post_id: replyToPostId,
      status: 'pending', first_seen_at: 0,
    })

    await rpc.sendRawTransaction(startSigned.serializedTx)
    for (const s of chunkSigneds) {
      await rpc.sendRawTransaction(s.serializedTx)
    }
  }

  return { sending, error, submitPost, claimProfile, txCount }
}

function hexToPostIdBytes(hex16) {
  const reversed = []
  for (let i = 0; i < 16; i += 2) reversed.unshift(parseInt(hex16.slice(i, i + 2), 16))
  return new Uint8Array(reversed)
}
```

- [ ] **Step 2: Create src/composables/useFeed.js**

```javascript
import { ref, onMounted } from 'vue'
import { useFeedStore } from '../stores/feed.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { getCatalogRefs, getPost } from '../db/queries.js'
import { FEED_PAGE_SIZE } from '../protocol/constants.js'

export function useFeed() {
  const store   = useFeedStore()
  const indexer = useIndexer()
  const cursor  = ref({ block_height: Infinity, tx_index: Infinity })

  async function loadPage() {
    store.loading = true
    try {
      const refs = await getCatalogRefs(['POST_INLINE', 'POST_START'], {
        limit:         FEED_PAGE_SIZE,
        beforeHeight:  cursor.value.block_height,
        beforeTxIndex: cursor.value.tx_index,
      })

      const posts = await Promise.all(refs.map(async ref => {
        if (ref.type === 'POST_INLINE') {
          const post = await getPost(ref.sender, ref.post_id)
          return post ?? { author: ref.sender, post_id: ref.post_id, status: 'inline', content: null, _skeleton: true }
        }
        const post = await getPost(ref.sender, ref.post_id)
        if (!post) {
          indexer?.syncDerivedAddress && triggerDerivedSync(ref, indexer)
          return { author: ref.sender, post_id: ref.post_id, status: 'pending', block_height: ref.block_height, content: null, _skeleton: true }
        }
        return post
      }))

      if (refs.length) {
        const last = refs[refs.length - 1]
        cursor.value = { block_height: last.block_height, tx_index: last.tx_index }
      }

      store.appendPosts(posts)
      store.hasMore = refs.length === FEED_PAGE_SIZE
    } finally {
      store.loading = false
    }
  }

  async function refresh() {
    store.clear()
    cursor.value = { block_height: Infinity, tx_index: Infinity }
    await indexer?.startDeltaSync()
    await loadPage()
  }

  onMounted(refresh)

  return { posts: store.posts, loading: store.loading, hasMore: store.hasMore, loadPage, refresh }
}

async function triggerDerivedSync(ref, indexer) {
  const { nqToAddressBytes, addressBytesToNq, derivePostAddress } = await import('../protocol/address.js')
  const authorBytes  = nqToAddressBytes(ref.sender)
  const postIdBytes  = hexToPostIdBytes(ref.post_id)
  const derivedBytes = await derivePostAddress(authorBytes, postIdBytes)
  const derivedNq    = addressBytesToNq(derivedBytes)
  indexer.syncDerivedAddress(derivedNq).catch(() => {})
}

function hexToPostIdBytes(hex16) {
  const reversed = []
  for (let i = 0; i < 16; i += 2) reversed.unshift(parseInt(hex16.slice(i, i + 2), 16))
  return new Uint8Array(reversed)
}
```

- [ ] **Step 3: Create src/composables/useProfile.js**

```javascript
import { ref } from 'vue'
import { getUser, getCatalogRefsBySender, getPost } from '../db/queries.js'

export function useProfile(address) {
  const user    = ref(null)
  const posts   = ref([])
  const loading = ref(false)

  async function load() {
    const addr = typeof address === 'object' ? address.value : address
    if (!addr) return
    loading.value = true
    try {
      user.value = await getUser(addr)
      const refs = await getCatalogRefsBySender(addr, ['POST_INLINE', 'POST_START'])
      const resolved = await Promise.all(refs.map(r => getPost(addr, r.post_id)))
      posts.value = resolved
        .filter(p => p && (p.status === 'complete' || p.status === 'inline'))
        .sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)
    } finally {
      loading.value = false
    }
  }

  return { user, posts, loading, load }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/composables/
git commit -m "feat: usePost, useFeed, useProfile composables"
```

---

## Task 11: UI Components

Implement the minimal UI to verify the full flow works. Refer to spec §7.2 for component contracts.

- [ ] **Step 1: Create layout components**

`src/components/layout/AppShell.vue` — RouterView + BottomNav, wraps everything.  
`src/components/layout/BottomNav.vue` — Home / compose button / profile tabs.

- [ ] **Step 2: Create auth components**

`src/components/auth/WalletButton.vue` — shows address or "Connect" button.  
`src/components/auth/LoginModal.vue` — calls `hub.getAddress()`, sets auth store.

- [ ] **Step 3: Create feed components**

`src/components/feed/PostSkeleton.vue` — animated gray placeholder card.  
`src/components/feed/PostCard.vue` — renders post content, author, timestamp. Shows "tentative" badge if `block_height === 0` (optimistic write).  
`src/components/feed/FeedView.vue` — uses `useFeed()`, renders PostCards / PostSkeletons with infinite scroll trigger.

- [ ] **Step 4: Create post composer**

`src/components/post/PostComposer.vue` — textarea (280 char limit), shows tx count from `usePost().txCount(text)`, submit calls `usePost().submitPost(text)`.

- [ ] **Step 5: Create profile components**

`src/components/profile/ProfileCard.vue` — address, username, display name.  
`src/components/profile/ProfileView.vue` — uses `useProfile(address)`, renders ProfileCard + post list.

- [ ] **Step 6: Wire App.vue onboarding**

On login: if `auth.hasClaimed === false`, show profile claim modal (username + display name form → `usePost().claimProfile()`).

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "feat: UI components — feed, composer, profile, auth"
```

---

## Task 12: Run All Tests + Testnet Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke test — onboarding**

1. Open app, click Connect — Hub popup
2. Sign in with testnet wallet
3. Onboarding modal appears (username + display name)
4. Submit → 1 Hub popup (PROFILE_CLAIM → POST_CATALOG)
5. After confirmation: auth store shows username/display name

- [ ] **Step 4: Smoke test — post inline**

1. Open composer, type ≤51 chars of text
2. UI shows "1 transaction (1 Luna)"
3. Submit → 1 Hub popup (POST_INLINE → POST_CATALOG)
4. Post appears in profile feed immediately (optimistic write)
5. Post appears in global feed after catalog delta sync

- [ ] **Step 5: Smoke test — post chunked**

1. Open composer, type 160 chars
2. UI shows "4 transactions (4 Luna)"
3. Submit → 4 Hub popups sequentially
4. Post appears in profile feed as skeleton → then content assembles
5. DevTools → IndexedDB → nimfeed-v1 → posts: status changes pending → complete

- [ ] **Step 6: Smoke test — global feed without login**

1. Open app without signing in
2. Global feed loads posts from catalog
3. Read-only works

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: Phase 1 complete — profile claim, post inline/chunked, global feed, profile view"
```

---

## Phase 1 Complete

Profile claim: 1 tx. Inline post: 1 tx. Chunked post: N+1 txs. Global feed from post catalog. Profile feed from catalog filtered by sender. No self-transactions. No per-user address sync.

**Phase 2 plan** (follow graph, following feed, username search): `docs/superpowers/plans/2026-05-05-nimfeed-phase2.md`
