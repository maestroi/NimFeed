# NimFeed Phase 1 — Core MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working on-chain microblogging MVP on Nimiq 2.0 Albatross — Hub login, user registration, post creation, global feed, and profile view, all backed by a browser IndexedDB indexer with no backend.

**Architecture:** Hybrid catalog + per-user namespace. A single catalog address receives USER_REG, USERNAME_CLAIM, and POST_ANNOUNCE events. All post data (POST_START, POST_CHUNK, PROFILE_SET) travels as self-transactions to the user's own wallet address. The browser streams and indexes transactions lazily into IndexedDB via a dual-cursor sync strategy.

**Tech Stack:** Vue 3.5, Vite 8, Tailwind CSS 4, Pinia 3, Dexie 4, @nimiq/hub-api ^1.13, plain JavaScript (ES2022), Vitest for unit tests.

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
│   ├── constants.js          new — magic bytes, type codes, addresses, limits
│   ├── utils.js              new — hexToBytes, bytesToHex, addressBytesToNq, nqToAddressBytes, postIdToHex, generatePostId
│   ├── encoder.js            new — buildUserReg, buildUsernameClaim, buildProfileSet, buildPostStart, buildPostChunk, buildPostAnnounce
│   ├── decoder.js            new — parseTransaction → typed event objects
│   └── compression.js        new — deflateRaw, inflateRaw, isCompressionSupported
│
├── chain/
│   ├── rpc.js                new — NimiqRPC class (ported + extended from nimiq-doom)
│   └── hub.js                new — useHub composable (ported + extended from nimiq-2048)
│
├── db/
│   ├── schema.js             new — Dexie instance with all 8 stores
│   └── queries.js            new — typed query helpers
│
├── indexer/
│   ├── handlers.js           new — handleUserReg, handleUsernameClaim, handleProfileSet, handlePostStart, handlePostChunk, handlePostAnnounce
│   ├── assembler.js          new — tryAssemble (chunk concat + hash verify + decompress)
│   ├── IndexerService.js     new — singleton sync engine
│   └── useIndexer.js         new — Vue composable wrapping IndexerService
│
├── stores/
│   ├── auth.js               new — Pinia: current user address, profile, registered state
│   ├── feed.js               new — Pinia: active feed slice (≤50 posts)
│   └── ui.js                 new — Pinia: modal state, composer open, filter settings
│
├── composables/
│   ├── usePost.js            new — encode → sign → broadcast → watch confirmation
│   ├── useFeed.js            new — global feed pagination + reactive updates
│   └── useProfile.js         new — profile resolution + edit flow
│
└── components/
    ├── layout/AppShell.vue   new — top nav, outlet, bottom nav
    ├── layout/BottomNav.vue  new — Home / Write / Profile tabs
    ├── auth/LoginModal.vue   new — Hub login flow
    ├── auth/WalletButton.vue new — connect/disconnect button
    ├── feed/FeedView.vue     new — global feed container
    ├── feed/PostCard.vue     new — single post display
    ├── feed/PostSkeleton.vue new — loading placeholder
    ├── post/PostComposer.vue new — write + submit post
    └── profile/
        ├── ProfileView.vue   new — user profile page
        └── ProfileCard.vue   new — profile header card

tests/
├── protocol/utils.test.js
├── protocol/encoder.test.js
├── protocol/decoder.test.js
├── protocol/compression.test.js
├── db/schema.test.js
└── indexer/assembler.test.js
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/style.css`
- Create: `src/main.js`
- Create: `src/App.vue`
- Create: `src/router.js`

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

- [ ] **Step 6: Create src/router.js**

```javascript
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/',          component: () => import('./components/feed/FeedView.vue') },
  { path: '/profile/:address', component: () => import('./components/profile/ProfileView.vue') },
  { path: '/post',      component: () => import('./components/post/PostComposer.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
```

- [ ] **Step 7: Create src/main.js**

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')
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

- [ ] **Step 9: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 10: Verify test runner**

```bash
npm test
```

Expected: `No test files found` (zero failures — runner works).

- [ ] **Step 11: Commit**

```bash
git add package.json vite.config.js index.html src/ tests/
git commit -m "feat: scaffold Vue 3 + Vite + Tailwind + Vitest project"
```

---

## Task 2: Protocol Constants + Binary Utilities

**Files:**
- Create: `src/protocol/constants.js`
- Create: `src/protocol/utils.js`
- Create: `tests/protocol/utils.test.js`

- [ ] **Step 1: Create src/protocol/constants.js**

```javascript
export const MAGIC_0 = 0x4E  // 'N'
export const MAGIC_1 = 0x46  // 'F'
export const VERSION  = 0x01

export const TYPES = Object.freeze({
  USER_REG:       0x01,
  USERNAME_CLAIM: 0x02,
  PROFILE_SET:    0x03,
  POST_START:     0x04,
  POST_CHUNK:     0x05,
  POST_ANNOUNCE:  0x06,
  FOLLOW:         0x07,
  UNFOLLOW:       0x08,
  LIKE:           0x09,
  UNLIKE:         0x0A,
})

// Set these to real addresses before deploying.
// Generate a dedicated wallet for the catalog and never use it for anything else.
export const CATALOG_ADDRESS         = 'NQ32 0VD4 26TR 1394 KXBJ 862C NFKG 61M5 GFJ0'  // testnet placeholder
export const MAINNET_CATALOG_ADDRESS = ''  // fill before mainnet launch

export const TX_VALUE_LUNA                  = 1
export const CHUNK_SIZE                     = 50
export const MAX_POST_CHARS                 = 280
export const MISSING_CHUNKS_BLOCK_WINDOW    = 48
export const FEED_PAGE_SIZE                 = 20
export const TENTATIVE_BLOCK_CONFIRMATIONS  = 10
export const SYNC_PAGE_SIZE                 = 500
export const SYNC_TX_BUDGET_PER_TICK        = 2000
export const SYNC_WALL_CLOCK_BUDGET_MS      = 10_000
export const USER_SYNC_STALE_THRESHOLD_MS   = 5 * 60 * 1000
```

- [ ] **Step 2: Write failing tests for utils**

Create `tests/protocol/utils.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import {
  hexToBytes, bytesToHex,
  postIdToHex, generatePostId,
  normalizeUsername,
  addressBytesToNq, nqToAddressBytes,
} from '../../src/protocol/utils.js'

describe('hexToBytes', () => {
  it('converts hex string to Uint8Array', () => {
    expect(hexToBytes('4e46')).toEqual(new Uint8Array([0x4e, 0x46]))
  })
  it('handles empty string', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array([]))
  })
})

describe('bytesToHex', () => {
  it('converts Uint8Array to lowercase hex', () => {
    expect(bytesToHex(new Uint8Array([0x4e, 0x46]))).toBe('4e46')
  })
})

describe('postIdToHex', () => {
  it('produces a 16-char string', () => {
    const buf = generatePostId()
    expect(postIdToHex(buf)).toHaveLength(16)
  })
  it('sorts chronologically as a string', () => {
    const buf1 = new ArrayBuffer(8)
    const buf2 = new ArrayBuffer(8)
    const v1 = new DataView(buf1)
    const v2 = new DataView(buf2)
    v1.setUint32(0, 1000, true)
    v2.setUint32(0, 2000, true)
    expect(postIdToHex(buf1) < postIdToHex(buf2)).toBe(true)
  })
})

describe('normalizeUsername', () => {
  it('lowercases and strips invalid chars', () => {
    expect(normalizeUsername('Hello_World!')).toBe('hello_world')
  })
  it('returns null for too-short username', () => {
    expect(normalizeUsername('ab')).toBeNull()
  })
  it('returns null for too-long username', () => {
    expect(normalizeUsername('a'.repeat(32))).toBeNull()
  })
  it('allows digits and underscores', () => {
    expect(normalizeUsername('user_123')).toBe('user_123')
  })
})

describe('addressBytesToNq / nqToAddressBytes', () => {
  it('round-trips a 20-byte address', () => {
    const bytes = new Uint8Array(20).fill(1)
    const nq = addressBytesToNq(bytes)
    expect(nq).toMatch(/^NQ/)
    expect(nqToAddressBytes(nq)).toEqual(bytes)
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
npm test tests/protocol/utils.test.js
```

Expected: FAIL — `utils.js` not found.

- [ ] **Step 4: Create src/protocol/utils.js**

```javascript
// Base32 alphabet used by Nimiq (excludes I, O, W, Z)
const BASE32_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

export function hexToBytes(hex) {
  if (!hex || hex.length === 0) return new Uint8Array(0)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Converts an 8-byte post_id buffer (LE u32 seconds + LE u32 random)
// to a 16-char big-endian hex string suitable for alphabetical sort.
export function postIdToHex(buf) {
  const view = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer)
  const seconds = view.getUint32(0, true)
  const random  = view.getUint32(4, true)
  return seconds.toString(16).padStart(8, '0') + random.toString(16).padStart(8, '0')
}

export function generatePostId() {
  const buf  = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(Date.now() / 1000), true)
  view.setUint32(4, crypto.getRandomValues(new Uint32Array(1))[0], true)
  return buf
}

export function normalizeUsername(raw) {
  if (!raw) return null
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (s.length < 3 || s.length > 31) return null
  return s
}

// Converts 20 raw address bytes → NQ-format string (base32 + IBAN mod-97 check)
export function addressBytesToNq(bytes) {
  let b32 = ''
  for (const byte of bytes) {
    b32 += BASE32_ALPHABET[(byte >> 3) & 0x1F]
    b32 += BASE32_ALPHABET[byte & 0x07]  // simplified — see full impl below
  }
  // Full Nimiq base32 encoding (5-bit groups)
  const bits = Array.from(bytes).map(b => b.toString(2).padStart(8, '0')).join('')
  let base32 = ''
  for (let i = 0; i < bits.length; i += 5) {
    base32 += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  }
  // Compute IBAN mod-97 check digits
  const expanded = (base32 + 'NQ00').split('').map(c => {
    const i = BASE32_ALPHABET.indexOf(c)
    return i >= 0 ? i.toString() : ({ N: '23', Q: '26' }[c] ?? c)
  }).join('')
  const check = 98 - mod97(expanded)
  return `NQ${String(check).padStart(2, '0')} ${base32.match(/.{1,4}/g).join(' ')}`
}

// Converts NQ-format string → 20 raw address bytes
export function nqToAddressBytes(nq) {
  const clean = nq.replace(/\s/g, '').slice(4)  // strip "NQ" + 2 check digits
  const bits = clean.split('').map(c => {
    const i = BASE32_ALPHABET.indexOf(c)
    return i.toString(2).padStart(5, '0')
  }).join('').slice(0, 160)
  const bytes = new Uint8Array(20)
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  }
  return bytes
}

function mod97(str) {
  let remainder = 0
  for (const c of str) {
    remainder = (remainder * 10 + parseInt(c, 10)) % 97
  }
  return remainder
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test tests/protocol/utils.test.js
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/protocol/constants.js src/protocol/utils.js tests/protocol/utils.test.js tests/setup.js
git commit -m "feat: protocol constants and binary utilities"
```

---

## Task 3: Protocol Encoder

**Files:**
- Create: `src/protocol/encoder.js`
- Create: `tests/protocol/encoder.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/protocol/encoder.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import {
  buildUserReg, buildUsernameClaim, buildProfileSet,
  buildPostStart, buildPostChunk, buildPostAnnounce,
} from '../../src/protocol/encoder.js'
import { TYPES, VERSION } from '../../src/protocol/constants.js'
import { generatePostId } from '../../src/protocol/utils.js'

function header(bytes) {
  return { magic: String.fromCharCode(bytes[0], bytes[1]), version: bytes[2], type: bytes[3] }
}

describe('buildUserReg', () => {
  it('produces 64 bytes with correct header', () => {
    const out = buildUserReg()
    expect(out).toHaveLength(64)
    expect(header(out)).toEqual({ magic: 'NF', version: VERSION, type: TYPES.USER_REG })
  })
})

describe('buildUsernameClaim', () => {
  it('encodes normalized username starting at byte 4', () => {
    const out = buildUsernameClaim('Alice_99')
    expect(out).toHaveLength(64)
    expect(header(out).type).toBe(TYPES.USERNAME_CLAIM)
    const raw = new TextDecoder().decode(out.slice(4, 36)).replace(/\0/g, '')
    expect(raw).toBe('alice_99')
  })
  it('throws on invalid username', () => {
    expect(() => buildUsernameClaim('ab')).toThrow()
  })
})

describe('buildProfileSet', () => {
  it('sets flags correctly', () => {
    const out = buildProfileSet({ displayName: 'Alice', bio: 'hello' })
    expect(out[4]).toBe(0x03)  // bit0 + bit1
  })
  it('encodes display_name at bytes 5-28', () => {
    const out = buildProfileSet({ displayName: 'Alice', bio: null })
    const name = new TextDecoder().decode(out.slice(5, 29)).replace(/\0/g, '')
    expect(name).toBe('Alice')
  })
})

describe('buildPostStart', () => {
  it('produces 64 bytes', () => {
    const postIdBuf = generatePostId()
    const out = buildPostStart({
      postIdBuf,
      totalChunks: 3,
      flags: 0x01,
      contentHash: new Uint8Array(8).fill(0xAB),
      replyToPostId: null,
      replyToAuthor: null,
    })
    expect(out).toHaveLength(64)
    expect(out[12]).toBe(3)    // totalChunks
    expect(out[13]).toBe(0x01) // flags compressed
  })
})

describe('buildPostChunk', () => {
  it('encodes chunk_index and data_len', () => {
    const data = new Uint8Array(50).fill(0xFF)
    const out = buildPostChunk({ postIdBuf: generatePostId(), chunkIndex: 2, data })
    expect(out[12]).toBe(2)   // chunk_index
    expect(out[13]).toBe(50)  // data_len
    expect(out[14]).toBe(0xFF)
  })
  it('clamps data to 50 bytes', () => {
    const data = new Uint8Array(60).fill(1)
    const out = buildPostChunk({ postIdBuf: generatePostId(), chunkIndex: 0, data })
    expect(out[13]).toBe(50)
  })
})

describe('buildPostAnnounce', () => {
  it('encodes post_id at bytes 4-11', () => {
    const postIdBuf = generatePostId()
    const out = buildPostAnnounce({ postIdBuf })
    expect(header(out).type).toBe(TYPES.POST_ANNOUNCE)
    expect(out.slice(4, 12)).toEqual(new Uint8Array(postIdBuf))
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/protocol/encoder.test.js
```

Expected: FAIL — `encoder.js` not found.

- [ ] **Step 3: Create src/protocol/encoder.js**

```javascript
import { MAGIC_0, MAGIC_1, VERSION, TYPES } from './constants.js'
import { normalizeUsername } from './utils.js'

function makeBuffer() {
  const buf   = new ArrayBuffer(64)
  const bytes = new Uint8Array(buf)
  const view  = new DataView(buf)
  bytes[0] = MAGIC_0
  bytes[1] = MAGIC_1
  bytes[2] = VERSION
  return { bytes, view }
}

export function buildUserReg() {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, TYPES.USER_REG)
  return bytes
}

export function buildUsernameClaim(rawUsername) {
  const username = normalizeUsername(rawUsername)
  if (!username) throw new Error(`Invalid username: "${rawUsername}"`)
  const { bytes, view } = makeBuffer()
  view.setUint8(3, TYPES.USERNAME_CLAIM)
  bytes.set(new TextEncoder().encode(username).slice(0, 31), 4)
  return bytes
}

export function buildProfileSet({ displayName, bio }) {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, TYPES.PROFILE_SET)
  let flags = 0
  if (displayName) { flags |= 0x01; bytes.set(new TextEncoder().encode(displayName).slice(0, 23), 5) }
  if (bio)         { flags |= 0x02; bytes.set(new TextEncoder().encode(bio).slice(0, 31), 29) }
  view.setUint8(4, flags)
  return bytes
}

export function buildPostStart({ postIdBuf, totalChunks, flags, contentHash, replyToPostId, replyToAuthor }) {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, TYPES.POST_START)
  bytes.set(new Uint8Array(postIdBuf), 4)
  view.setUint8(12, totalChunks)
  view.setUint8(13, flags)
  bytes.set(contentHash.slice(0, 8), 14)
  if (replyToPostId) bytes.set(new Uint8Array(replyToPostId), 22)
  if (replyToAuthor) bytes.set(replyToAuthor.slice(0, 20), 30)
  return bytes
}

export function buildPostChunk({ postIdBuf, chunkIndex, data }) {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, TYPES.POST_CHUNK)
  bytes.set(new Uint8Array(postIdBuf), 4)
  view.setUint8(12, chunkIndex)
  const chunk = data.slice(0, 50)
  view.setUint8(13, chunk.length)
  bytes.set(chunk, 14)
  return bytes
}

export function buildPostAnnounce({ postIdBuf }) {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, TYPES.POST_ANNOUNCE)
  bytes.set(new Uint8Array(postIdBuf), 4)
  return bytes
}

export function buildFollow(targetBytes)   { return buildSelfTarget(TYPES.FOLLOW,   targetBytes) }
export function buildUnfollow(targetBytes) { return buildSelfTarget(TYPES.UNFOLLOW, targetBytes) }

function buildSelfTarget(type, targetBytes) {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, type)
  bytes.set(targetBytes.slice(0, 20), 4)
  return bytes
}

export function buildLike({ postIdBuf, postAuthorBytes })   { return buildReaction(TYPES.LIKE,   postIdBuf, postAuthorBytes) }
export function buildUnlike({ postIdBuf, postAuthorBytes }) { return buildReaction(TYPES.UNLIKE, postIdBuf, postAuthorBytes) }

function buildReaction(type, postIdBuf, postAuthorBytes) {
  const { bytes, view } = makeBuffer()
  view.setUint8(3, type)
  bytes.set(new Uint8Array(postIdBuf), 4)
  bytes.set(postAuthorBytes.slice(0, 20), 12)
  return bytes
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/protocol/encoder.test.js
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/encoder.js tests/protocol/encoder.test.js
git commit -m "feat: protocol encoder for all Phase 1 event types"
```

---

## Task 4: Protocol Decoder

**Files:**
- Create: `src/protocol/decoder.js`
- Create: `tests/protocol/decoder.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/protocol/decoder.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { parseTransaction } from '../../src/protocol/decoder.js'
import { buildUserReg, buildUsernameClaim, buildProfileSet, buildPostStart, buildPostChunk, buildPostAnnounce } from '../../src/protocol/encoder.js'
import { bytesToHex, generatePostId } from '../../src/protocol/utils.js'

function mockTx(payload, from = 'NQ00 SELF', to = 'NQ00 SELF') {
  return { hash: 'abc', from, to, data: bytesToHex(payload), blockHeight: 100, transactionIndex: 0, timestamp: 0 }
}

const CATALOG = 'NQ32 0VD4 26TR 1394 KXBJ 862C NFKG 61M5 GFJ0'

describe('parseTransaction', () => {
  it('returns null for non-NF data', () => {
    expect(parseTransaction({ ...mockTx(new Uint8Array([0x00, 0x01])), data: '0001' })).toBeNull()
  })

  it('parses USER_REG', () => {
    const tx = mockTx(buildUserReg(), 'NQ00 SELF', CATALOG)
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('USER_REG')
    expect(ev.from).toBe('NQ00 SELF')
  })

  it('parses USERNAME_CLAIM and normalizes username', () => {
    const tx = mockTx(buildUsernameClaim('Alice_99'), 'NQ00 SELF', CATALOG)
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('USERNAME_CLAIM')
    expect(ev.username).toBe('alice_99')
  })

  it('parses PROFILE_SET', () => {
    const tx = mockTx(buildProfileSet({ displayName: 'Alice', bio: 'hello world' }), 'NQ00 SELF', 'NQ00 SELF')
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('PROFILE_SET')
    expect(ev.displayName).toBe('Alice')
    expect(ev.bio).toBe('hello world')
  })

  it('parses POST_START', () => {
    const postIdBuf = generatePostId()
    const hash = new Uint8Array(8).fill(0xAB)
    const tx = mockTx(buildPostStart({ postIdBuf, totalChunks: 2, flags: 0x01, contentHash: hash, replyToPostId: null, replyToAuthor: null }))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_START')
    expect(ev.totalChunks).toBe(2)
    expect(ev.compressed).toBe(true)
    expect(ev.contentHash).toHaveLength(16)
  })

  it('parses POST_CHUNK', () => {
    const data = new Uint8Array(50).fill(0x42)
    const tx = mockTx(buildPostChunk({ postIdBuf: generatePostId(), chunkIndex: 1, data }))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_CHUNK')
    expect(ev.chunkIndex).toBe(1)
    expect(ev.data).toHaveLength(50)
  })

  it('parses POST_ANNOUNCE', () => {
    const tx = mockTx(buildPostAnnounce({ postIdBuf: generatePostId() }), 'NQ00 AUTHOR', CATALOG)
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('POST_ANNOUNCE')
    expect(ev.postId).toHaveLength(16)
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/protocol/decoder.test.js
```

Expected: FAIL — `decoder.js` not found.

- [ ] **Step 3: Create src/protocol/decoder.js**

```javascript
import { MAGIC_0, MAGIC_1, VERSION, TYPES } from './constants.js'
import { hexToBytes, bytesToHex, postIdToHex, normalizeUsername } from './utils.js'

export function parseTransaction(tx) {
  const hex = (tx.data ?? '').toLowerCase()
  if (hex.length < 8) return null
  if (hex[0] !== '4' || hex[1] !== 'e' || hex[2] !== '4' || hex[3] !== '6') return null

  const bytes = hexToBytes(hex)
  if (bytes[2] !== VERSION) return null

  const type = bytes[3]
  const base = {
    type,
    event:       null,
    txHash:      tx.hash,
    from:        tx.from,
    to:          tx.to,
    blockHeight: tx.blockHeight,
    txIndex:     tx.transactionIndex ?? 0,
  }

  switch (type) {
    case TYPES.USER_REG:       return { ...base, event: 'USER_REG' }
    case TYPES.USERNAME_CLAIM: return decodeUsernameClaim(base, bytes)
    case TYPES.PROFILE_SET:    return decodeProfileSet(base, bytes)
    case TYPES.POST_START:     return decodePostStart(base, bytes)
    case TYPES.POST_CHUNK:     return decodePostChunk(base, bytes)
    case TYPES.POST_ANNOUNCE:  return decodePostAnnounce(base, bytes)
    case TYPES.FOLLOW:         return decodeFollowUnfollow(base, bytes, 'FOLLOW')
    case TYPES.UNFOLLOW:       return decodeFollowUnfollow(base, bytes, 'UNFOLLOW')
    case TYPES.LIKE:           return decodeLikeUnlike(base, bytes, 'LIKE')
    case TYPES.UNLIKE:         return decodeLikeUnlike(base, bytes, 'UNLIKE')
    default:                   return null
  }
}

function nullTermString(bytes, offset, length) {
  const slice = bytes.slice(offset, offset + length)
  const end   = slice.indexOf(0)
  return new TextDecoder().decode(end === -1 ? slice : slice.slice(0, end))
}

function decodeUsernameClaim(base, bytes) {
  const raw      = nullTermString(bytes, 4, 32)
  const username = normalizeUsername(raw)
  if (!username) return null
  return { ...base, event: 'USERNAME_CLAIM', username }
}

function decodeProfileSet(base, bytes) {
  const flags          = bytes[4]
  const hasDisplayName = (flags & 0x01) !== 0
  const hasBio         = (flags & 0x02) !== 0
  return {
    ...base,
    event:       'PROFILE_SET',
    displayName: hasDisplayName ? nullTermString(bytes, 5, 24) : null,
    bio:         hasBio         ? nullTermString(bytes, 29, 32) : null,
  }
}

function decodePostStart(base, bytes) {
  const postId         = postIdToHex(bytes.slice(4, 12).buffer)
  const totalChunks    = bytes[12]
  const flags          = bytes[13]
  const compressed     = (flags & 0x01) !== 0
  const isReply        = (flags & 0x02) !== 0
  const contentHash    = bytesToHex(bytes.slice(14, 22))
  const replyToPostId  = isReply ? postIdToHex(bytes.slice(22, 30).buffer) : null
  const replyToAuthor  = isReply ? bytesToHex(bytes.slice(30, 50)) : null
  return { ...base, event: 'POST_START', postId, totalChunks, flags, compressed, isReply, contentHash, replyToPostId, replyToAuthor }
}

function decodePostChunk(base, bytes) {
  const postId     = postIdToHex(bytes.slice(4, 12).buffer)
  const chunkIndex = bytes[12]
  const dataLen    = bytes[13]
  const data       = bytes.slice(14, 14 + dataLen)
  return { ...base, event: 'POST_CHUNK', postId, chunkIndex, data }
}

function decodePostAnnounce(base, bytes) {
  const postId = postIdToHex(bytes.slice(4, 12).buffer)
  return { ...base, event: 'POST_ANNOUNCE', postId }
}

function decodeFollowUnfollow(base, bytes, event) {
  return { ...base, event, targetAddress: bytesToHex(bytes.slice(4, 24)) }
}

function decodeLikeUnlike(base, bytes, event) {
  const postId     = postIdToHex(bytes.slice(4, 12).buffer)
  const postAuthor = bytesToHex(bytes.slice(12, 32))
  return { ...base, event, postId, postAuthor }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/protocol/decoder.test.js
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/decoder.js tests/protocol/decoder.test.js
git commit -m "feat: protocol decoder for all Phase 1 event types"
```

---

## Task 5: Compression Utilities

**Files:**
- Create: `src/protocol/compression.js`
- Create: `tests/protocol/compression.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/protocol/compression.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { deflateRaw, inflateRaw, isCompressionSupported, encodePost } from '../../src/protocol/compression.js'

describe('deflateRaw / inflateRaw', () => {
  it('round-trips bytes', async () => {
    const input    = new TextEncoder().encode('Hello, NimFeed! '.repeat(10))
    const comp     = await deflateRaw(input)
    const restored = await inflateRaw(comp)
    expect(restored).toEqual(input)
  })
})

describe('encodePost', () => {
  it('returns payload, flags, and contentHash', async () => {
    const result = await encodePost('Hello world from NimFeed!')
    expect(result.payload).toBeInstanceOf(Uint8Array)
    expect(result.contentHash).toHaveLength(8)
    expect(typeof result.compressed).toBe('boolean')
  })

  it('does not compress if compressed is larger', async () => {
    // Very short strings often do not compress smaller
    const result = await encodePost('Hi')
    if (!result.compressed) {
      expect(result.payload).toEqual(new TextEncoder().encode('Hi'))
    }
  })

  it('splits into 50-byte chunks', async () => {
    const long   = 'A'.repeat(200)
    const result = await encodePost(long)
    for (const chunk of result.chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50)
    }
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/protocol/compression.test.js
```

Expected: FAIL.

- [ ] **Step 3: Create src/protocol/compression.js**

```javascript
export function isCompressionSupported() {
  return typeof CompressionStream !== 'undefined'
}

export async function deflateRaw(bytes) {
  if (!isCompressionSupported()) return bytes
  const cs     = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

export async function inflateRaw(bytes) {
  if (!isCompressionSupported()) return bytes
  const ds     = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  writer.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

// Encodes post text → { payload, compressed, contentHash, chunks }
export async function encodePost(text) {
  const raw        = new TextEncoder().encode(text)
  const comp       = await deflateRaw(raw)
  const compressed = comp.length < raw.length
  const payload    = compressed ? comp : raw

  const digest      = await crypto.subtle.digest('SHA-256', payload)
  const contentHash = new Uint8Array(digest).slice(0, 8)

  const chunks = []
  for (let i = 0; i < payload.length; i += 50) {
    chunks.push(payload.slice(i, i + 50))
  }

  return { payload, compressed, contentHash, chunks }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/protocol/compression.test.js
```

Expected: All pass. (If `CompressionStream` is unavailable in happy-dom, the test still passes because `deflateRaw` falls back to returning raw bytes and the round-trip holds.)

- [ ] **Step 5: Commit**

```bash
git add src/protocol/compression.js tests/protocol/compression.test.js
git commit -m "feat: compression utilities with deflate-raw and encodePost"
```

---

## Task 6: Database Schema + Queries

**Files:**
- Create: `src/db/schema.js`
- Create: `src/db/queries.js`
- Create: `tests/db/schema.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/db/schema.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
// fake-indexeddb/auto is loaded by tests/setup.js
import { db } from '../../src/db/schema.js'
import { putUser, getUser, putPost, getPost, putCatalogRef, getCatalogRefs } from '../../src/db/queries.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('users store', () => {
  it('stores and retrieves a user', async () => {
    await putUser({ address: 'NQ01 TEST', display_name: 'Alice', bio: null, registered_height: 100 })
    const user = await getUser('NQ01 TEST')
    expect(user.display_name).toBe('Alice')
  })
})

describe('posts store', () => {
  it('stores and retrieves a post by compound key', async () => {
    await putPost({
      author: 'NQ01 TEST', post_id: '0000000100000001',
      block_height: 200, tx_index: 0,
      content: null, total_chunks: 2, chunks_received: 0,
      compressed: true, content_hash: 'aabbccdd00112233',
      is_reply: false, reply_to_author: null, reply_to_post_id: null,
      status: 'pending', first_seen_at: 200,
    })
    const post = await getPost('NQ01 TEST', '0000000100000001')
    expect(post.status).toBe('pending')
    expect(post.total_chunks).toBe(2)
  })
})

describe('catalog_refs store', () => {
  it('stores and retrieves POST_ANNOUNCE refs', async () => {
    await putCatalogRef({
      tx_hash: 'hash1', type: 'POST_ANNOUNCE',
      sender: 'NQ01 TEST', post_id: '0000000100000001',
      username: null, block_height: 300, tx_index: 1, seen_at: Date.now(),
    })
    const refs = await getCatalogRefs('POST_ANNOUNCE', { limit: 10 })
    expect(refs).toHaveLength(1)
    expect(refs[0].post_id).toBe('0000000100000001')
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/db/schema.test.js
```

Expected: FAIL.

- [ ] **Step 3: Create src/db/schema.js**

```javascript
import Dexie from 'dexie'

export const db = new Dexie('nimfeed-v1')

db.version(1).stores({
  users:           'address, username',
  username_claims: '[username+address], username, address',
  posts:           '[author+post_id], block_height, author, status, [reply_to_author+reply_to_post_id]',
  post_chunks:     '[author+post_id+chunk_index]',
  follows:         '[follower+followee], follower, followee',
  likes:           '[liker+post_author+post_id], [post_author+post_id], liker',
  catalog_refs:    'tx_hash, type, sender, [type+block_height+tx_index], [sender+type]',
  sync_state:      'address',
})
```

- [ ] **Step 4: Create src/db/queries.js**

```javascript
import { db } from './schema.js'

// Users
export const putUser    = (user)    => db.users.put(user)
export const getUser    = (address) => db.users.get(address)
export const updateUser = (address, fields) => db.users.update(address, fields)

// Username claims
export const putUsernameClaim = (claim) => db.username_claims.put(claim)
export async function resolveUsername(username) {
  const claims = await db.username_claims.where('username').equals(username).toArray()
  if (!claims.length) return null
  return claims.sort((a, b) => a.block_height - b.block_height || a.tx_index - b.tx_index)[0]
}

// Posts
export const putPost    = (post)              => db.posts.put(post)
export const getPost    = (author, post_id)   => db.posts.get([author, post_id])
export const updatePost = (author, post_id, fields) => db.posts.update([author, post_id], fields)
export const getPostsByAuthor = (author) =>
  db.posts.where('author').equals(author).filter(p => p.status === 'complete').toArray()

// Post chunks
export const putChunk    = (chunk) => db.post_chunks.put(chunk)
export const getChunks   = (author, post_id) =>
  db.post_chunks.where('[author+post_id+chunk_index]')
    .between([author, post_id, 0], [author, post_id, 255], true, true)
    .toArray()
export const deleteChunks = (author, post_id) =>
  db.post_chunks.where('[author+post_id+chunk_index]')
    .between([author, post_id, 0], [author, post_id, 255], true, true)
    .delete()

// Catalog refs
export const putCatalogRef = (ref) => db.catalog_refs.put(ref)
export async function getCatalogRefs(type, { limit = 20, beforeHeight = Infinity, beforeTxIndex = Infinity } = {}) {
  return db.catalog_refs
    .where('[type+block_height+tx_index]')
    .below([type, beforeHeight, beforeTxIndex])
    .reverse()
    .limit(limit)
    .toArray()
}

// Sync state
export const getSyncState    = (address) => db.sync_state.get(address)
export const putSyncState    = (state)   => db.sync_state.put(state)
export const updateSyncState = (address, fields) => db.sync_state.update(address, fields)
```

- [ ] **Step 5: Run — expect pass**

```bash
npm test tests/db/schema.test.js
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.js src/db/queries.js tests/db/schema.test.js
git commit -m "feat: IndexedDB schema (8 stores) and typed query helpers"
```

---

## Task 7: RPC Client

**Files:**
- Create: `src/chain/rpc.js`

No unit tests — RPC requires a live node. Verify manually in Task 19 (testnet smoke test).

- [ ] **Step 1: Create src/chain/rpc.js**

Port from `nimiq-doom/web/src/nimiq-rpc.js` and add `sendRawTransaction` + `getBlockNumber` + `normalizeTransaction`. Key differences from doom: normalizeTransaction handles Albatross field names and this client supports posting, not just reading.

```javascript
const DEFAULT_ENDPOINT  = 'https://rpc-mainnet.nimiqscan.com'
const TESTNET_ENDPOINT  = 'https://rpc-testnet.nimiqwatch.com'
const MAX_RETRIES       = 3
const BASE_DELAY_MS     = 1000

export class NimiqRPC {
  constructor(url = DEFAULT_ENDPOINT) {
    this.url = url
    this._id = 1
  }

  setEndpoint(url) { this.url = url }

  async call(method, params = []) {
    let attempt = 0
    while (true) {
      try {
        const res  = await fetch(this.url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ jsonrpc: '2.0', id: this._id++, method, params }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error))
        return json.result
      } catch (err) {
        if (++attempt >= MAX_RETRIES) throw err
        await new Promise(r => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)))
      }
    }
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

  async getBlockNumber() {
    const result = await this.call('getBlockNumber')
    return typeof result === 'object' ? result.blockNumber ?? result : result
  }

  // Returns up to `max` transactions for `address`, starting after `startAt` hash.
  // Newest first. startAt=null returns the most recent page.
  async getTransactionsByAddress(address, max = 500, startAt = null) {
    const params = startAt
      ? { address, max, startAt }
      : { address, max }
    let result
    try {
      result = await this.call('getTransactionsByAddress', [params])
    } catch {
      result = await this.call('getTransactionsByAddress', [address, max, startAt].filter(Boolean))
    }
    const txs = Array.isArray(result) ? result : (result?.data ?? [])
    return txs.map(tx => this.normalizeTransaction(tx))
  }

  async getTransactionByHash(hash) {
    const result = await this.call('getTransactionByHash', [hash])
    if (!result) return null
    return this.normalizeTransaction(result)
  }

  // Broadcasts a signed, serialized transaction (hex string).
  async sendRawTransaction(serializedHex) {
    return this.call('sendRawTransaction', [serializedHex])
  }
}

export const rpc = new NimiqRPC()
```

- [ ] **Step 2: Commit**

```bash
git add src/chain/rpc.js
git commit -m "feat: NimiqRPC client with normalizeTransaction and sendRawTransaction"
```

---

## Task 8: Hub Client

**Files:**
- Create: `src/chain/hub.js`

Port from `nimiq-2048/frontend/src/shared/composables/useHub.js`. Add `signTransaction` for posting. The Hub `signTransaction` method returns a `{ serializedTx, hash }` object — verify exact field names against `@nimiq/hub-api` docs when wiring up the first real post.

- [ ] **Step 1: Create src/chain/hub.js**

```javascript
import HubApi from '@nimiq/hub-api'

// Detect network from hostname (mirrors nimiq-2048 pattern)
function getHubEndpoint() {
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host.includes('testnet')) {
    return HubApi.DEFAULT_ENDPOINT_TESTNET ?? 'https://hub.nimiq-testnet.com'
  }
  return HubApi.DEFAULT_ENDPOINT ?? 'https://hub.nimiq.com'
}

const IFRAME_TIMEOUT_MS = 6000

let _hub = null
function getHub() {
  if (!_hub) _hub = new HubApi(getHubEndpoint())
  return _hub
}

export function useHub() {
  // Preload Hub iframe to reduce cold-start latency on first signing action.
  function warmup() {
    try { getHub().iframeRequest(HubApi.RequestType.SIGN_MESSAGE, {}, window.location.origin) } catch {}
  }

  // Sign a message for authentication (used during Hub login flow).
  async function signMessage(message, signer) {
    return getHub().signMessage({
      appName: 'NimFeed',
      message,
      signer,
    })
  }

  // Attempt iframe signing first; fall back to popup on timeout.
  async function signMessagePreferIframe(message, signer) {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('iframe-timeout')) }
      }, IFRAME_TIMEOUT_MS)

      getHub().iframeRequest(HubApi.RequestType.SIGN_MESSAGE, {
        appName: 'NimFeed', message, signer,
      }, window.location.origin)
        .then(result => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } })
        .catch(err   => { if (!settled) { settled = true; clearTimeout(timer); reject(err) } })
    })
  }

  // Sign a Nimiq 2.0 basic transaction with an extra data payload.
  // VERIFY: exact field names in @nimiq/hub-api v1.13 for Albatross signTransaction.
  // Expected return shape: { serializedTx: string (hex), hash: string }
  async function signTransaction({ sender, recipient, value, fee = 0, extraData, validityStartHeight = '+0' }) {
    return getHub().signTransaction({
      appName:             'NimFeed',
      sender,
      recipient,
      value,
      fee,
      extraData,
      validityStartHeight: String(validityStartHeight),
    })
  }

  return { warmup, signMessage, signMessagePreferIframe, signTransaction }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/chain/hub.js
git commit -m "feat: Hub client with signMessage and signTransaction"
```

---

## Task 9: Indexer Handlers

**Files:**
- Create: `src/indexer/handlers.js`
- Create: `tests/indexer/handlers.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/indexer/handlers.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processTransaction } from '../../src/indexer/handlers.js'
import { buildUserReg, buildProfileSet, buildPostStart, buildPostAnnounce } from '../../src/protocol/encoder.js'
import { bytesToHex, generatePostId } from '../../src/protocol/utils.js'
import { CATALOG_ADDRESS } from '../../src/protocol/constants.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function tx(payload, from, to, blockHeight = 100, txIndex = 0) {
  return { hash: Math.random().toString(36), from, to, data: bytesToHex(payload), blockHeight, transactionIndex: txIndex, timestamp: 0 }
}

describe('processTransaction', () => {
  it('indexes USER_REG into users and catalog_refs', async () => {
    await processTransaction(tx(buildUserReg(), 'NQ01 USER', CATALOG_ADDRESS))
    const user = await db.users.get('NQ01 USER')
    expect(user).toBeTruthy()
    expect(user.registered_height).toBe(100)
    const refs = await db.catalog_refs.where('type').equals('USER_REG').toArray()
    expect(refs).toHaveLength(1)
  })

  it('rejects USER_REG not sent to catalog', async () => {
    await processTransaction(tx(buildUserReg(), 'NQ01 USER', 'NQ02 OTHER'))
    const user = await db.users.get('NQ01 USER')
    expect(user).toBeUndefined()
  })

  it('indexes PROFILE_SET self-tx into users', async () => {
    await db.users.put({ address: 'NQ01 USER', registered_height: 100 })
    await processTransaction(tx(buildProfileSet({ displayName: 'Alice', bio: 'hi' }), 'NQ01 USER', 'NQ01 USER'))
    const user = await db.users.get('NQ01 USER')
    expect(user.display_name).toBe('Alice')
  })

  it('rejects PROFILE_SET that is not a self-tx', async () => {
    await db.users.put({ address: 'NQ01 USER', registered_height: 100 })
    await processTransaction(tx(buildProfileSet({ displayName: 'Alice', bio: null }), 'NQ01 USER', 'NQ02 OTHER'))
    const user = await db.users.get('NQ01 USER')
    expect(user.display_name).toBeUndefined()
  })

  it('indexes POST_START as pending post', async () => {
    const postIdBuf = generatePostId()
    const hash8     = new Uint8Array(8).fill(1)
    const payload   = buildPostStart({ postIdBuf, totalChunks: 2, flags: 0, contentHash: hash8, replyToPostId: null, replyToAuthor: null })
    await processTransaction(tx(payload, 'NQ01 USER', 'NQ01 USER'))
    const posts = await db.posts.where('author').equals('NQ01 USER').toArray()
    expect(posts).toHaveLength(1)
    expect(posts[0].status).toBe('pending')
    expect(posts[0].total_chunks).toBe(2)
  })

  it('indexes POST_ANNOUNCE into catalog_refs', async () => {
    const postIdBuf = generatePostId()
    await processTransaction(tx(buildPostAnnounce({ postIdBuf }), 'NQ01 USER', CATALOG_ADDRESS))
    const refs = await db.catalog_refs.where('type').equals('POST_ANNOUNCE').toArray()
    expect(refs).toHaveLength(1)
    expect(refs[0].sender).toBe('NQ01 USER')
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/indexer/handlers.test.js
```

Expected: FAIL.

- [ ] **Step 3: Create src/indexer/handlers.js**

```javascript
import { TYPES, CATALOG_ADDRESS } from '../protocol/constants.js'
import { parseTransaction } from '../protocol/decoder.js'
import { db } from '../db/schema.js'
import { putUser, getUser, updateUser, putPost, getPost, updatePost, putChunk, putCatalogRef, putUsernameClaim } from '../db/queries.js'
import { tryAssemble } from './assembler.js'

function isValidCatalogEvent(tx) { return tx.to === CATALOG_ADDRESS }
function isValidSelfTx(tx)       { return tx.from === tx.to }

export async function processTransaction(tx) {
  const event = parseTransaction(tx)
  if (!event) return

  switch (event.type) {
    case TYPES.USER_REG:
      if (!isValidCatalogEvent(tx)) return
      return handleUserReg(event, tx)
    case TYPES.USERNAME_CLAIM:
      if (!isValidCatalogEvent(tx)) return
      return handleUsernameClaim(event, tx)
    case TYPES.PROFILE_SET:
      if (!isValidSelfTx(tx)) return
      return handleProfileSet(event, tx)
    case TYPES.POST_START:
      if (!isValidSelfTx(tx)) return
      return handlePostStart(event, tx)
    case TYPES.POST_CHUNK:
      if (!isValidSelfTx(tx)) return
      return handlePostChunk(event, tx)
    case TYPES.POST_ANNOUNCE:
      if (!isValidCatalogEvent(tx)) return
      return handlePostAnnounce(event, tx)
    // FOLLOW, UNFOLLOW, LIKE, UNLIKE handled in Phase 2 and 3
  }
}

async function handleUserReg(event, tx) {
  const existing = await getUser(event.from)
  if (!existing) {
    await putUser({
      address:           event.from,
      display_name:      null,
      bio:               null,
      registered_height: event.blockHeight,
      username:          null,
      last_synced_height: 0,
    })
  }
  await putCatalogRef({
    tx_hash:      event.txHash,
    type:         'USER_REG',
    sender:       event.from,
    post_id:      null,
    username:     null,
    block_height: event.blockHeight,
    tx_index:     event.txIndex,
    seen_at:      Date.now(),
  })
}

async function handleUsernameClaim(event, tx) {
  await putUsernameClaim({
    username:     event.username,
    address:      event.from,
    block_height: event.blockHeight,
    tx_index:     event.txIndex,
    tx_hash:      event.txHash,
  })
  // Update users.username cache if this is the winning claim
  const existing = await getUser(event.from)
  if (!existing) return
  const winnerHeight   = existing.username_height ?? Infinity
  const winnerTxIndex  = existing.username_tx_index ?? Infinity
  const isEarlier = event.blockHeight < winnerHeight ||
    (event.blockHeight === winnerHeight && event.txIndex < winnerTxIndex)
  if (!existing.username || isEarlier) {
    await updateUser(event.from, {
      username:          event.username,
      username_height:   event.blockHeight,
      username_tx_index: event.txIndex,
    })
  }
  await putCatalogRef({
    tx_hash:      event.txHash,
    type:         'USERNAME_CLAIM',
    sender:       event.from,
    post_id:      null,
    username:     event.username,
    block_height: event.blockHeight,
    tx_index:     event.txIndex,
    seen_at:      Date.now(),
  })
}

async function handleProfileSet(event, tx) {
  const existing = await getUser(event.from)
  if (!existing) return  // must have USER_REG first
  const fields = {}
  if (event.displayName !== null) fields.display_name = event.displayName
  if (event.bio !== null)         fields.bio           = event.bio
  await updateUser(event.from, fields)
}

async function handlePostStart(event, tx) {
  const existing = await getPost(event.from, event.postId)
  const chunksReceived = existing?.chunks_received ?? 0
  await putPost({
    author:          event.from,
    post_id:         event.postId,
    block_height:    event.blockHeight,
    tx_index:        event.txIndex,
    content:         null,
    total_chunks:    event.totalChunks,
    chunks_received: chunksReceived,
    compressed:      event.compressed,
    content_hash:    event.contentHash,
    is_reply:        event.isReply,
    reply_to_author: event.replyToAuthor,
    reply_to_post_id: event.replyToPostId,
    status:          'pending',
    first_seen_at:   event.blockHeight,
  })
  await tryAssemble(event.from, event.postId)
}

async function handlePostChunk(event, tx) {
  await putChunk({
    author:      event.from,
    post_id:     event.postId,
    chunk_index: event.chunkIndex,
    data:        event.data,
    data_len:    event.data.length,
  })
  const post = await getPost(event.from, event.postId)
  if (!post) {
    // POST_START not yet seen — create placeholder
    await putPost({
      author:          event.from,
      post_id:         event.postId,
      block_height:    event.blockHeight,
      tx_index:        event.txIndex,
      content:         null,
      total_chunks:    null,
      chunks_received: 1,
      compressed:      false,
      content_hash:    '',
      is_reply:        false,
      reply_to_author: null,
      reply_to_post_id: null,
      status:          'pending',
      first_seen_at:   event.blockHeight,
    })
  } else {
    await updatePost(event.from, event.postId, { chunks_received: (post.chunks_received ?? 0) + 1 })
    await tryAssemble(event.from, event.postId)
  }
}

async function handlePostAnnounce(event, tx) {
  await putCatalogRef({
    tx_hash:      event.txHash,
    type:         'POST_ANNOUNCE',
    sender:       event.from,
    post_id:      event.postId,
    username:     null,
    block_height: event.blockHeight,
    tx_index:     event.txIndex,
    seen_at:      Date.now(),
  })
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/indexer/handlers.test.js
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/indexer/handlers.js tests/indexer/handlers.test.js
git commit -m "feat: indexer event handlers for Phase 1 event types"
```

---

## Task 10: Chunk Assembler

**Files:**
- Create: `src/indexer/assembler.js`
- Create: `tests/indexer/assembler.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/indexer/assembler.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { tryAssemble } from '../../src/indexer/assembler.js'
import { encodePost } from '../../src/protocol/compression.js'
import { bytesToHex, generatePostId, postIdToHex } from '../../src/protocol/utils.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function seedPost(text) {
  const { payload, compressed, contentHash, chunks } = await encodePost(text)
  const postIdBuf = generatePostId()
  const post_id   = postIdToHex(postIdBuf)
  const author    = 'NQ01 TEST'

  await db.posts.put({
    author, post_id,
    block_height: 100, tx_index: 0,
    content: null, total_chunks: chunks.length,
    chunks_received: chunks.length,
    compressed, content_hash: bytesToHex(contentHash),
    is_reply: false, reply_to_author: null, reply_to_post_id: null,
    status: 'pending', first_seen_at: 100,
  })

  for (let i = 0; i < chunks.length; i++) {
    await db.post_chunks.put({ author, post_id, chunk_index: i, data: chunks[i], data_len: chunks[i].length })
  }

  return { author, post_id, text }
}

describe('tryAssemble', () => {
  it('assembles chunks into post content', async () => {
    const { author, post_id, text } = await seedPost('Hello NimFeed!')
    await tryAssemble(author, post_id)
    const post = await db.posts.get([author, post_id])
    expect(post.status).toBe('complete')
    expect(post.content).toBe(text)
  })

  it('deletes chunks after successful assembly', async () => {
    const { author, post_id } = await seedPost('Clean up chunks please')
    await tryAssemble(author, post_id)
    const remaining = await db.post_chunks.where('[author+post_id+chunk_index]')
      .between([author, post_id, 0], [author, post_id, 255], true, true).count()
    expect(remaining).toBe(0)
  })

  it('marks post invalid_hash on tampered data', async () => {
    const { author, post_id } = await seedPost('Tamper test')
    // Corrupt one chunk
    const chunks = await db.post_chunks.where('[author+post_id+chunk_index]')
      .between([author, post_id, 0], [author, post_id, 255], true, true).toArray()
    if (chunks.length) {
      const bad = new Uint8Array(chunks[0].data)
      bad[0] = ~bad[0]
      await db.post_chunks.put({ ...chunks[0], data: bad })
    }
    await tryAssemble(author, post_id)
    const post = await db.posts.get([author, post_id])
    expect(post.status).toBe('invalid_hash')
  })

  it('does nothing if total_chunks is null (POST_START not yet seen)', async () => {
    await db.posts.put({
      author: 'NQ01 TEST', post_id: 'deadbeef00000001',
      block_height: 100, tx_index: 0,
      content: null, total_chunks: null, chunks_received: 1,
      compressed: false, content_hash: '',
      is_reply: false, reply_to_author: null, reply_to_post_id: null,
      status: 'pending', first_seen_at: 100,
    })
    await tryAssemble('NQ01 TEST', 'deadbeef00000001')
    const post = await db.posts.get(['NQ01 TEST', 'deadbeef00000001'])
    expect(post.status).toBe('pending')
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/indexer/assembler.test.js
```

Expected: FAIL.

- [ ] **Step 3: Create src/indexer/assembler.js**

```javascript
import { db } from '../db/schema.js'
import { getPost, updatePost, getChunks, deleteChunks } from '../db/queries.js'
import { inflateRaw } from '../protocol/compression.js'
import { bytesToHex } from '../protocol/utils.js'

export async function tryAssemble(author, post_id) {
  const post = await getPost(author, post_id)
  if (!post || post.total_chunks === null) return
  if (post.chunks_received < post.total_chunks) return

  const chunks = await getChunks(author, post_id)
  if (chunks.length < post.total_chunks) return

  // Sort by chunk_index — defensive, should already be ordered
  chunks.sort((a, b) => a.chunk_index - b.chunk_index)

  // Concatenate chunk data
  const totalBytes = chunks.reduce((sum, c) => sum + c.data.length, 0)
  const encoded    = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    encoded.set(chunk.data, offset)
    offset += chunk.data.length
  }

  // Verify hash BEFORE decompression
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const hash8  = bytesToHex(new Uint8Array(digest).slice(0, 8))
  if (hash8 !== post.content_hash) {
    await updatePost(author, post_id, { status: 'invalid_hash' })
    return
  }

  // Decompress if flagged
  const payload = post.compressed ? await inflateRaw(encoded) : encoded
  const content = new TextDecoder().decode(payload)

  await updatePost(author, post_id, { status: 'complete', content })
  await deleteChunks(author, post_id)
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/indexer/assembler.test.js
```

Expected: All pass.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All pass across all test files.

- [ ] **Step 6: Commit**

```bash
git add src/indexer/assembler.js tests/indexer/assembler.test.js
git commit -m "feat: chunk assembler with hash verification and decompression"
```

---

## Task 11: IndexerService

**Files:**
- Create: `src/indexer/IndexerService.js`
- Create: `src/indexer/useIndexer.js`

- [ ] **Step 1: Create src/indexer/IndexerService.js**

```javascript
import { rpc } from '../chain/rpc.js'
import { processTransaction } from './handlers.js'
import { getSyncState, putSyncState, updateSyncState } from '../db/queries.js'
import { CATALOG_ADDRESS, SYNC_PAGE_SIZE, SYNC_TX_BUDGET_PER_TICK, SYNC_WALL_CLOCK_BUDGET_MS } from '../protocol/constants.js'

class IndexerService extends EventTarget {
  constructor() {
    super()
    this._running = false
  }

  async syncAddress(address, { latestPageOnly = false } = {}) {
    const state = await getSyncState(address) ?? {
      address,
      scope:                 address === CATALOG_ADDRESS ? 'catalog' : 'user',
      newest_seen_tx_hash:   null,
      oldest_synced_cursor:  null,
      fully_synced:          false,
      last_synced_at:        0,
    }

    // Delta sync — fetch newest page, stop when we hit known territory
    const newPage = await rpc.getTransactionsByAddress(address, SYNC_PAGE_SIZE, null)
    if (newPage.length) {
      let processed = 0
      for (const tx of newPage) {
        if (tx.hash === state.newest_seen_tx_hash) break
        await processTransaction(tx)
        processed++
      }
      state.newest_seen_tx_hash = newPage[0].hash
      state.last_synced_at      = Date.now()
      await putSyncState(state)
      if (processed) this.dispatchEvent(new CustomEvent('updated', { detail: { address } }))
    }

    if (latestPageOnly || state.fully_synced) return

    // Backfill — paginate from oldest cursor toward genesis
    await this._backfill(address, state)
  }

  async _backfill(address, state) {
    const start = Date.now()
    let processed = 0

    while (true) {
      if (Date.now() - start > SYNC_WALL_CLOCK_BUDGET_MS) break

      const page = await rpc.getTransactionsByAddress(address, SYNC_PAGE_SIZE, state.oldest_synced_cursor)
      if (!page.length) { state.fully_synced = true; break }

      for (const tx of page) {
        await processTransaction(tx)
        if (++processed >= SYNC_TX_BUDGET_PER_TICK) {
          await new Promise(r => setTimeout(r, 0))  // yield to event loop
          processed = 0
        }
      }

      state.oldest_synced_cursor = page[page.length - 1].hash
      await putSyncState(state)
      this.dispatchEvent(new CustomEvent('updated', { detail: { address } }))

      if (page.length < SYNC_PAGE_SIZE) { state.fully_synced = true; break }
    }

    await putSyncState(state)
  }

  async syncCatalog() { return this.syncAddress(CATALOG_ADDRESS) }

  async syncUser(address, opts = {}) { return this.syncAddress(address, opts) }

  startDeltaSync(intervalMs = 60_000) {
    if (this._deltaInterval) return
    this._deltaInterval = setInterval(() => this.syncCatalog(), intervalMs)
    // Also sync on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.syncCatalog()
    })
  }

  stopDeltaSync() {
    clearInterval(this._deltaInterval)
    this._deltaInterval = null
  }
}

export const indexer = new IndexerService()
```

- [ ] **Step 2: Create src/indexer/useIndexer.js**

```javascript
import { ref, onMounted, onUnmounted } from 'vue'
import { indexer } from './IndexerService.js'

export function useIndexer() {
  const syncing = ref(false)

  function onUpdated(e) {
    // Composables that care about specific addresses can filter e.detail.address
  }

  onMounted(() => indexer.addEventListener('updated', onUpdated))
  onUnmounted(() => indexer.removeEventListener('updated', onUpdated))

  async function syncCatalog() {
    syncing.value = true
    try { await indexer.syncCatalog() } finally { syncing.value = false }
  }

  async function syncUser(address, opts) {
    return indexer.syncUser(address, opts)
  }

  return { syncing, syncCatalog, syncUser }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/indexer/IndexerService.js src/indexer/useIndexer.js
git commit -m "feat: IndexerService with dual-cursor sync and delta sync"
```

---

## Task 12: Pinia Stores

**Files:**
- Create: `src/stores/auth.js`
- Create: `src/stores/feed.js`
- Create: `src/stores/ui.js`

- [ ] **Step 1: Create src/stores/auth.js**

```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const LS_KEY = 'nimfeed_last_address'

export const useAuthStore = defineStore('auth', () => {
  const address     = ref(localStorage.getItem(LS_KEY) ?? null)
  const displayName = ref(null)
  const username    = ref(null)
  const registered  = ref(false)

  const isLoggedIn = computed(() => !!address.value)

  function setUser({ addr, display_name, uname, reg }) {
    address.value     = addr
    displayName.value = display_name ?? null
    username.value    = uname ?? null
    registered.value  = !!reg
    if (addr) localStorage.setItem(LS_KEY, addr)
  }

  function clearUser() {
    address.value     = null
    displayName.value = null
    username.value    = null
    registered.value  = false
    localStorage.removeItem(LS_KEY)
  }

  return { address, displayName, username, registered, isLoggedIn, setUser, clearUser }
})
```

- [ ] **Step 2: Create src/stores/feed.js**

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFeedStore = defineStore('feed', () => {
  const posts    = ref([])   // array of post objects (≤50)
  const loading  = ref(false)
  const hasMore  = ref(true)

  function setPosts(newPosts)     { posts.value = newPosts }
  function appendPosts(more)      { posts.value = [...posts.value, ...more].slice(0, 50) }
  function updatePost(author, post_id, fields) {
    const idx = posts.value.findIndex(p => p.author === author && p.post_id === post_id)
    if (idx !== -1) posts.value[idx] = { ...posts.value[idx], ...fields }
  }
  function clear() { posts.value = []; hasMore.value = true }

  return { posts, loading, hasMore, setPosts, appendPosts, updatePost, clear }
})
```

- [ ] **Step 3: Create src/stores/ui.js**

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const loginModalOpen    = ref(false)
  const composerOpen      = ref(false)
  const filterNoUserReg   = ref(true)   // default: hide unregistered users
  const filterMinAgBlocks = ref(10)     // default: hide accounts < 10 blocks old

  return { loginModalOpen, composerOpen, filterNoUserReg, filterMinAgBlocks }
})
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/auth.js src/stores/feed.js src/stores/ui.js
git commit -m "feat: Pinia stores for auth, feed, and UI state"
```

---

## Task 13: usePost Composable

**Files:**
- Create: `src/composables/usePost.js`

- [ ] **Step 1: Create src/composables/usePost.js**

```javascript
import { ref } from 'vue'
import { useHub } from '../chain/hub.js'
import { rpc } from '../chain/rpc.js'
import { encodePost } from '../protocol/compression.js'
import { buildPostStart, buildPostChunk, buildPostAnnounce } from '../protocol/encoder.js'
import { generatePostId, postIdToHex, bytesToHex } from '../protocol/utils.js'
import { TX_VALUE_LUNA, CATALOG_ADDRESS, MAX_POST_CHARS } from '../protocol/constants.js'
import { db } from '../db/schema.js'
import { useAuthStore } from '../stores/auth.js'

export function usePost() {
  const hub         = useHub()
  const auth        = useAuthStore()
  const submitting  = ref(false)
  const error       = ref(null)

  async function submit(text, { replyToAuthor = null, replyToPostId = null } = {}) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    if (!text?.trim())    throw new Error('Post text is empty')
    if (text.length > MAX_POST_CHARS) throw new Error(`Post exceeds ${MAX_POST_CHARS} chars`)

    submitting.value = true
    error.value      = null

    try {
      const { payload, compressed, contentHash, chunks } = await encodePost(text)
      const postIdBuf = generatePostId()
      const postIdHex = postIdToHex(postIdBuf)
      const flags     = (compressed ? 0x01 : 0x00) | (replyToAuthor ? 0x02 : 0x00)
      const height    = await rpc.getBlockNumber()

      // Build all transaction payloads
      const txPayloads = [
        { to: auth.address, data: buildPostStart({ postIdBuf, totalChunks: chunks.length, flags, contentHash, replyToPostId: null, replyToAuthor: null }) },
        ...chunks.map((chunk, i) => ({ to: auth.address, data: buildPostChunk({ postIdBuf, chunkIndex: i, data: chunk }) })),
        { to: CATALOG_ADDRESS, data: buildPostAnnounce({ postIdBuf }) },
      ]

      // Sign all transactions sequentially via Hub
      const signed = []
      for (const { to, data } of txPayloads) {
        const result = await hub.signTransaction({
          sender:              auth.address,
          recipient:           to,
          value:               TX_VALUE_LUNA,
          fee:                 0,
          extraData:           data,
          validityStartHeight: `+${signed.length}`,  // stagger validity
        })
        signed.push(result)
      }

      // Optimistic local write so post appears immediately in profile feed
      await db.posts.put({
        author:           auth.address,
        post_id:          postIdHex,
        block_height:     height,
        tx_index:         0,
        content:          text,
        total_chunks:     chunks.length,
        chunks_received:  chunks.length,
        compressed,
        content_hash:     bytesToHex(contentHash),
        is_reply:         !!replyToAuthor,
        reply_to_author:  replyToAuthor,
        reply_to_post_id: replyToPostId,
        status:           'pending',
        first_seen_at:    height,
      })

      // Broadcast: POST_START first, chunks in order, POST_ANNOUNCE last
      for (const tx of signed) {
        await rpc.sendRawTransaction(tx.serializedTx)
      }

      // Poll for confirmation on the announce tx
      watchConfirmation(auth.address, postIdHex, signed[signed.length - 1].hash)

      return postIdHex
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      submitting.value = false
    }
  }

  function watchConfirmation(author, post_id, announceTxHash) {
    const MAX_ATTEMPTS = 24  // 120s at 5s interval
    let attempts = 0
    const interval = setInterval(async () => {
      try {
        const tx = await rpc.getTransactionByHash(announceTxHash)
        if (tx?.blockHeight) {
          await db.posts.update([author, post_id], { status: 'complete', block_height: tx.blockHeight })
          clearInterval(interval)
        }
      } catch {}
      if (++attempts >= MAX_ATTEMPTS) clearInterval(interval)
    }, 5000)
  }

  return { submit, submitting, error }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/usePost.js
git commit -m "feat: usePost composable — encode, sign, broadcast, watch confirmation"
```

---

## Task 14: useFeed + useProfile Composables

**Files:**
- Create: `src/composables/useFeed.js`
- Create: `src/composables/useProfile.js`

- [ ] **Step 1: Create src/composables/useFeed.js**

```javascript
import { ref, onMounted } from 'vue'
import { useFeedStore } from '../stores/feed.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { getCatalogRefs } from '../db/queries.js'
import { db } from '../db/schema.js'
import { FEED_PAGE_SIZE, CATALOG_ADDRESS } from '../protocol/constants.js'

export function useFeed() {
  const store     = useFeedStore()
  const { syncCatalog, syncUser } = useIndexer()
  const cursor    = ref({ block_height: Infinity, tx_index: Infinity })

  async function loadPage() {
    store.loading = true
    try {
      const refs = await getCatalogRefs('POST_ANNOUNCE', {
        limit:         FEED_PAGE_SIZE,
        beforeHeight:  cursor.value.block_height,
        beforeTxIndex: cursor.value.tx_index,
      })

      const posts = await Promise.all(refs.map(async ref => {
        const post = await db.posts.get([ref.sender, ref.post_id])
        if (!post) {
          // Trigger background sync and return a skeleton placeholder
          syncUser(ref.sender, { latestPageOnly: true }).catch(() => {})
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
    await syncCatalog()
    await loadPage()
  }

  onMounted(refresh)

  return { posts: store.posts, loading: store.loading, hasMore: store.hasMore, loadPage, refresh }
}
```

- [ ] **Step 2: Create src/composables/useProfile.js**

```javascript
import { ref, watch } from 'vue'
import { db } from '../db/schema.js'
import { getUser, getPostsByAuthor } from '../db/queries.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { USER_SYNC_STALE_THRESHOLD_MS, FEED_PAGE_SIZE } from '../protocol/constants.js'
import { getSyncState } from '../db/queries.js'

export function useProfile(address) {
  const { syncUser } = useIndexer()
  const user  = ref(null)
  const posts = ref([])
  const loading = ref(false)

  async function load(addr) {
    if (!addr) return
    loading.value = true
    try {
      // Check if sync is stale
      const state = await getSyncState(addr)
      const stale = !state || Date.now() - state.last_synced_at > USER_SYNC_STALE_THRESHOLD_MS
      if (stale) await syncUser(addr)

      user.value  = await getUser(addr)
      const all   = await getPostsByAuthor(addr)
      posts.value = all.sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)
    } finally {
      loading.value = false
    }
  }

  async function updateProfile({ displayName, bio }) {
    // Just triggers Hub signing — actual update happens via indexer after confirmation
    const { useHub } = await import('../chain/hub.js')
    const { buildProfileSet } = await import('../protocol/encoder.js')
    const hub = useHub()
    const { rpc } = await import('../chain/rpc.js')
    const { useAuthStore } = await import('../stores/auth.js')
    const auth = useAuthStore()

    const data   = buildProfileSet({ displayName, bio })
    const height = await rpc.getBlockNumber()
    const signed = await hub.signTransaction({
      sender: auth.address, recipient: auth.address,
      value: 1, fee: 0, extraData: data, validityStartHeight: '+0',
    })
    await rpc.sendRawTransaction(signed.serializedTx)
  }

  if (typeof address === 'object' && address?.value !== undefined) {
    watch(address, addr => load(addr), { immediate: true })
  } else {
    load(address)
  }

  return { user, posts, loading, updateProfile }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/composables/useFeed.js src/composables/useProfile.js
git commit -m "feat: useFeed and useProfile composables"
```

---

## Task 15: UI Components

**Files:**
- Create: `src/components/auth/WalletButton.vue`
- Create: `src/components/auth/LoginModal.vue`
- Create: `src/components/feed/PostSkeleton.vue`
- Create: `src/components/feed/PostCard.vue`
- Create: `src/components/feed/FeedView.vue`
- Create: `src/components/post/PostComposer.vue`
- Create: `src/components/profile/ProfileCard.vue`
- Create: `src/components/profile/ProfileView.vue`
- Create: `src/components/layout/BottomNav.vue`
- Create: `src/components/layout/AppShell.vue`

- [ ] **Step 1: Create src/components/auth/WalletButton.vue**

```vue
<script setup>
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
const auth = useAuthStore()
const ui   = useUiStore()
</script>

<template>
  <button v-if="!auth.isLoggedIn"
    @click="ui.loginModalOpen = true"
    class="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700">
    Connect Wallet
  </button>
  <button v-else
    @click="auth.clearUser()"
    class="px-4 py-2 border border-gray-300 rounded-full text-sm hover:bg-gray-50">
    {{ auth.username ? '@' + auth.username : auth.address?.slice(0, 12) + '…' }}
  </button>
</template>
```

- [ ] **Step 2: Create src/components/auth/LoginModal.vue**

```vue
<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { useHub } from '../../chain/hub.js'
import { indexer } from '../../indexer/IndexerService.js'
import { db } from '../../db/schema.js'
import OnboardingFlow from './OnboardingFlow.vue'

const auth  = useAuthStore()
const ui    = useUiStore()
const hub   = useHub()
const error = ref(null)
const step  = ref('idle')   // idle | connecting | onboarding

async function connect() {
  error.value = null
  step.value  = 'connecting'
  try {
    // Use Hub chooseAddress or signMessage to get the user's address.
    // Hub signMessage returns { signer, signature } — signer is the NQ address.
    const result = await hub.signMessage('Login to NimFeed', auth.address ?? undefined)
    const address = result.signer

    auth.setUser({ addr: address, display_name: null, uname: null, reg: false })

    // Check if this address has a USER_REG in catalog
    const user = await db.users.get(address)
    if (!user?.registered_height) {
      step.value = 'onboarding'
    } else {
      auth.setUser({ addr: address, display_name: user.display_name, uname: user.username, reg: true })
      ui.loginModalOpen = false
      step.value = 'idle'
    }
  } catch (err) {
    error.value = err.message
    step.value  = 'idle'
  }
}
</script>

<template>
  <div v-if="ui.loginModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl">
      <h2 class="text-xl font-bold mb-4">Connect to NimFeed</h2>

      <div v-if="step === 'idle'">
        <p class="text-gray-500 text-sm mb-6">Sign in with your Nimiq wallet via Hub.</p>
        <button @click="connect" class="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
          Connect with Nimiq Hub
        </button>
        <p v-if="error" class="mt-3 text-red-500 text-sm">{{ error }}</p>
      </div>

      <div v-else-if="step === 'connecting'" class="text-center py-4 text-gray-500">
        Waiting for Hub…
      </div>

      <div v-else-if="step === 'onboarding'">
        <OnboardingFlow @done="ui.loginModalOpen = false; step = 'idle'" />
      </div>

      <button @click="ui.loginModalOpen = false; step = 'idle'"
        class="mt-4 w-full py-2 text-gray-400 text-sm hover:text-gray-600">
        Cancel
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create src/components/auth/OnboardingFlow.vue**

```vue
<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { useHub } from '../../chain/hub.js'
import { rpc } from '../../chain/rpc.js'
import { buildUserReg, buildUsernameClaim, buildProfileSet } from '../../protocol/encoder.js'
import { CATALOG_ADDRESS } from '../../protocol/constants.js'

const emit       = defineEmits(['done'])
const auth       = useAuthStore()
const hub        = useHub()
const username   = ref('')
const displayName = ref('')
const bio        = ref('')
const step       = ref(1)  // 1=username, 2=profile, 3=registering
const error      = ref(null)

async function register() {
  error.value = null
  step.value  = 3
  try {
    const height = await rpc.getBlockNumber()

    // Tx 1: USER_REG → catalog
    const regSigned = await hub.signTransaction({
      sender: auth.address, recipient: CATALOG_ADDRESS,
      value: 1, fee: 0, extraData: buildUserReg(), validityStartHeight: '+0',
    })
    await rpc.sendRawTransaction(regSigned.serializedTx)

    // Tx 2 (optional): USERNAME_CLAIM → catalog
    if (username.value.trim()) {
      const claimSigned = await hub.signTransaction({
        sender: auth.address, recipient: CATALOG_ADDRESS,
        value: 1, fee: 0, extraData: buildUsernameClaim(username.value.trim()), validityStartHeight: '+1',
      })
      await rpc.sendRawTransaction(claimSigned.serializedTx)
    }

    // Tx 3: PROFILE_SET → self
    const profileSigned = await hub.signTransaction({
      sender: auth.address, recipient: auth.address,
      value: 1, fee: 0,
      extraData: buildProfileSet({ displayName: displayName.value.trim() || null, bio: bio.value.trim() || null }),
      validityStartHeight: '+2',
    })
    await rpc.sendRawTransaction(profileSigned.serializedTx)

    auth.setUser({ addr: auth.address, display_name: displayName.value || null, uname: username.value || null, reg: true })
    emit('done')
  } catch (err) {
    error.value = err.message
    step.value  = 2
  }
}
</script>

<template>
  <div>
    <div v-if="step < 3">
      <h3 class="font-semibold mb-4">Set up your profile</h3>
      <input v-model="username" placeholder="username (optional, 3–31 chars)"
        class="w-full border rounded-lg px-3 py-2 mb-3 text-sm" />
      <input v-model="displayName" placeholder="Display name (optional)"
        class="w-full border rounded-lg px-3 py-2 mb-3 text-sm" />
      <textarea v-model="bio" placeholder="Bio (optional, 31 chars max)" maxlength="31" rows="2"
        class="w-full border rounded-lg px-3 py-2 mb-4 text-sm resize-none" />
      <button @click="register" class="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700">
        Register on NimFeed
      </button>
      <p v-if="error" class="mt-2 text-red-500 text-sm">{{ error }}</p>
      <p class="mt-2 text-gray-400 text-xs">This will send 2–3 transactions (2–3 Luna).</p>
    </div>
    <div v-else class="text-center py-4 text-gray-500">
      Registering on-chain…
    </div>
  </div>
</template>
```

- [ ] **Step 4: Create src/components/feed/PostSkeleton.vue**

```vue
<template>
  <div class="border-b border-gray-100 p-4 animate-pulse">
    <div class="flex gap-3">
      <div class="w-10 h-10 bg-gray-200 rounded-full shrink-0"></div>
      <div class="flex-1 space-y-2">
        <div class="h-3 bg-gray-200 rounded w-1/3"></div>
        <div class="h-3 bg-gray-200 rounded w-full"></div>
        <div class="h-3 bg-gray-200 rounded w-2/3"></div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Create src/components/feed/PostCard.vue**

```vue
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { TENTATIVE_BLOCK_CONFIRMATIONS } from '../../protocol/constants.js'

const props  = defineProps({ post: Object, tipHeight: Number })
const router = useRouter()

const tentative   = computed(() => props.tipHeight && (props.tipHeight - props.post.block_height) < TENTATIVE_BLOCK_CONFIRMATIONS)
const authorShort = computed(() => props.post.author?.slice(0, 16) + '…')
const timeLabel   = computed(() => `block ${props.post.block_height}`)
</script>

<template>
  <div class="border-b border-gray-100 p-4 hover:bg-gray-50 cursor-pointer"
    @click="router.push(`/profile/${post.author}`)">

    <div class="flex gap-3">
      <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0">
        {{ post.author?.[2] ?? '?' }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-sm truncate">{{ authorShort }}</span>
          <span class="text-gray-400 text-xs">· {{ timeLabel }}</span>
          <span v-if="tentative" class="text-yellow-500 text-xs" title="Waiting for confirmations">⏳</span>
        </div>
        <p v-if="post.status === 'complete'" class="text-gray-900 text-sm whitespace-pre-wrap break-words">
          {{ post.content }}
        </p>
        <p v-else-if="post.status === 'missing_chunks'" class="text-gray-400 text-sm italic">
          Post unavailable
        </p>
        <p v-else class="text-gray-400 text-sm italic">Loading…</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Create src/components/feed/FeedView.vue**

```vue
<script setup>
import { ref } from 'vue'
import { useFeed } from '../../composables/useFeed.js'
import PostCard from './PostCard.vue'
import PostSkeleton from './PostSkeleton.vue'

const { posts, loading, hasMore, loadPage, refresh } = useFeed()
const tipHeight = ref(0)
</script>

<template>
  <div>
    <div class="sticky top-0 bg-white/80 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between">
      <h1 class="font-bold text-lg">NimFeed</h1>
      <button @click="refresh" class="text-blue-500 text-sm hover:text-blue-700">Refresh</button>
    </div>

    <div v-if="loading && !posts.length">
      <PostSkeleton v-for="i in 5" :key="i" />
    </div>

    <template v-else>
      <template v-for="post in posts" :key="post.post_id">
        <PostSkeleton v-if="post._skeleton" />
        <PostCard v-else :post="post" :tip-height="tipHeight" />
      </template>

      <div v-if="hasMore" class="p-4 text-center">
        <button @click="loadPage" :disabled="loading"
          class="text-blue-500 text-sm hover:text-blue-700 disabled:opacity-50">
          {{ loading ? 'Loading…' : 'Load more' }}
        </button>
      </div>
      <div v-else class="p-8 text-center text-gray-400 text-sm">
        You've reached the beginning.
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 7: Create src/components/post/PostComposer.vue**

```vue
<script setup>
import { ref } from 'vue'
import { usePost } from '../../composables/usePost.js'
import { useAuthStore } from '../../stores/auth.js'
import { MAX_POST_CHARS } from '../../protocol/constants.js'

const auth            = useAuthStore()
const { submit, submitting, error } = usePost()
const text            = ref('')
const charCount       = ref(0)

function onInput(e) {
  text.value      = e.target.value
  charCount.value = text.value.length
}

async function post() {
  if (!text.value.trim() || submitting.value) return
  await submit(text.value.trim())
  text.value      = ''
  charCount.value = 0
}
</script>

<template>
  <div class="border-b border-gray-100 p-4">
    <div class="flex gap-3">
      <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0">
        {{ auth.address?.[2] ?? '?' }}
      </div>
      <div class="flex-1">
        <textarea
          :value="text"
          @input="onInput"
          :maxlength="MAX_POST_CHARS"
          placeholder="What's happening on-chain?"
          rows="3"
          class="w-full resize-none outline-none text-gray-900 placeholder-gray-400 text-sm"
        />
        <div class="flex items-center justify-between mt-2">
          <span class="text-xs" :class="charCount > MAX_POST_CHARS * 0.9 ? 'text-red-500' : 'text-gray-400'">
            {{ charCount }}/{{ MAX_POST_CHARS }}
          </span>
          <div class="flex items-center gap-2">
            <span v-if="error" class="text-red-500 text-xs">{{ error }}</span>
            <button
              @click="post"
              :disabled="!text.trim() || submitting"
              class="px-4 py-1.5 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {{ submitting ? 'Posting…' : 'Post' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 8: Create src/components/profile/ProfileCard.vue**

```vue
<script setup>
const props = defineProps({ user: Object, address: String })
</script>

<template>
  <div class="p-6 border-b border-gray-100">
    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold mb-3">
      {{ address?.[2] ?? '?' }}
    </div>
    <div class="font-bold text-lg">{{ user?.display_name ?? 'Anonymous' }}</div>
    <div v-if="user?.username" class="text-gray-500 text-sm">@{{ user.username }}</div>
    <div class="text-gray-400 text-xs mt-1 font-mono">{{ address }}</div>
    <p v-if="user?.bio" class="mt-3 text-gray-700 text-sm">{{ user.bio }}</p>
  </div>
</template>
```

- [ ] **Step 9: Create src/components/profile/ProfileView.vue**

```vue
<script setup>
import { useRoute } from 'vue-router'
import { useProfile } from '../../composables/useProfile.js'
import ProfileCard from './ProfileCard.vue'
import PostCard from '../feed/PostCard.vue'
import PostSkeleton from '../feed/PostSkeleton.vue'

const route              = useRoute()
const address            = route.params.address
const { user, posts, loading } = useProfile(address)
</script>

<template>
  <div>
    <div v-if="loading && !user">
      <div class="p-6 animate-pulse space-y-3">
        <div class="w-16 h-16 bg-gray-200 rounded-full"></div>
        <div class="h-4 bg-gray-200 rounded w-1/3"></div>
      </div>
    </div>
    <ProfileCard v-else :user="user" :address="address" />

    <PostSkeleton v-if="loading && !posts.length" v-for="i in 3" :key="i" />
    <PostCard v-for="post in posts" :key="post.post_id" :post="post" :tip-height="0" />

    <div v-if="!loading && !posts.length" class="p-8 text-center text-gray-400 text-sm">
      No posts yet.
    </div>
  </div>
</template>
```

- [ ] **Step 10: Create src/components/layout/BottomNav.vue**

```vue
<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'

const router = useRouter()
const route  = useRoute()
const ui     = useUiStore()
const auth   = useAuthStore()
</script>

<template>
  <nav class="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex justify-around py-3 z-40">
    <button @click="router.push('/')" :class="route.path === '/' ? 'text-blue-600' : 'text-gray-400'">
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 12l9-9 9 9v9H15v-6H9v6H3z"/></svg>
    </button>
    <button @click="auth.isLoggedIn ? (ui.composerOpen = true) : (ui.loginModalOpen = true)"
      class="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white -mt-4 shadow-lg hover:bg-blue-700">
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
    </button>
    <button @click="auth.isLoggedIn ? router.push(`/profile/${auth.address}`) : (ui.loginModalOpen = true)"
      :class="route.path.startsWith('/profile') ? 'text-blue-600' : 'text-gray-400'">
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
    </button>
  </nav>
</template>
```

- [ ] **Step 11: Create src/components/layout/AppShell.vue**

```vue
<script setup>
import { onMounted } from 'vue'
import BottomNav from './BottomNav.vue'
import LoginModal from '../auth/LoginModal.vue'
import PostComposer from '../post/PostComposer.vue'
import { useUiStore } from '../../stores/ui.js'
import { useHub } from '../../chain/hub.js'
import { indexer } from '../../indexer/IndexerService.js'

const ui  = useUiStore()
const hub = useHub()

onMounted(() => {
  hub.warmup()
  indexer.syncCatalog()
  indexer.startDeltaSync()
})
</script>

<template>
  <div class="min-h-screen bg-white max-w-xl mx-auto">
    <main class="pb-20">
      <router-view />
    </main>
    <BottomNav />
    <LoginModal />

    <!-- Composer overlay -->
    <div v-if="ui.composerOpen" class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div class="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-2xl">
        <div class="flex justify-end p-3">
          <button @click="ui.composerOpen = false" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <PostComposer />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 12: Commit**

```bash
git add src/components/ src/composables/
git commit -m "feat: UI components — auth, feed, composer, profile, app shell"
```

---

## Task 16: Final Wiring + Testnet Smoke Test

**Files:**
- Modify: `src/protocol/constants.js` — set testnet catalog address
- Verify: all modules connect end-to-end on testnet

- [ ] **Step 1: Create a testnet catalog wallet**

Using the Nimiq testnet faucet and wallet, create a dedicated NimFeed catalog address. This wallet's private key should be kept safe — it is the root of the NimFeed protocol on testnet.

Go to `https://wallet.nimiq-testnet.com` → create new wallet → copy the NQ address.

- [ ] **Step 2: Update CATALOG_ADDRESS in constants.js**

```javascript
// src/protocol/constants.js — replace the placeholder:
export const CATALOG_ADDRESS = 'NQ__YOUR_TESTNET_CATALOG_ADDRESS_HERE'
```

- [ ] **Step 3: Start dev server**

```bash
npm run dev
```

Expected: `http://localhost:5173` opens without console errors.

- [ ] **Step 4: Smoke test — read-only feed**

1. Open `http://localhost:5173`
2. Open DevTools → Network tab
3. Observe RPC call to `getTransactionsByAddress` for the catalog address
4. Expected: call succeeds (even if catalog is empty)
5. Global feed renders (empty state: "You've reached the beginning")

- [ ] **Step 5: Smoke test — Hub login**

1. Click "Connect Wallet"
2. Hub popup opens
3. Sign the message
4. Address appears in WalletButton
5. Expected: no console errors

- [ ] **Step 6: Smoke test — onboarding**

1. After Hub login, onboarding flow appears (first-time user)
2. Enter username + display name
3. Click Register — Hub popups appear (2–3 txs)
4. Sign each popup
5. Expected: transactions broadcast, no errors

- [ ] **Step 7: Smoke test — post creation**

1. Click the + button → composer opens
2. Type a short post (< 100 chars)
3. Click Post → Hub popups appear
4. Sign each (POST_START + POST_CHUNK(s) + POST_ANNOUNCE)
5. Expected: post appears in profile feed with `status: 'pending'`
6. After ~30s: post status changes to `complete`

- [ ] **Step 8: Smoke test — global feed**

1. After post is confirmed, reload the app
2. Global feed: wait for catalog sync
3. Expected: post appears in global feed

- [ ] **Step 9: Verify IndexedDB contents**

In DevTools → Application → IndexedDB → nimfeed-v1:
- `users`: your address with `registered_height`
- `posts`: your post with `status: 'complete'` and `content` set
- `catalog_refs`: POST_ANNOUNCE entry for your post
- `sync_state`: catalog entry with `newest_seen_tx_hash` set

- [ ] **Step 10: Run all tests one final time**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 11: Final commit**

```bash
git add src/protocol/constants.js
git commit -m "feat: set testnet catalog address — Phase 1 MVP complete"
```

---

## Phase 1 Complete

All 8 event types encoded and decoded. IndexedDB schema with 8 stores. Dual-cursor indexer. Hub login + onboarding. Post creation with compression. Global feed. Profile view.

**Phase 2 plan** (follows + following feed + username search): `docs/superpowers/plans/2026-05-05-nimfeed-phase2.md`  
**Phase 3 plan** (likes + replies + threads): `docs/superpowers/plans/2026-05-05-nimfeed-phase3.md`
