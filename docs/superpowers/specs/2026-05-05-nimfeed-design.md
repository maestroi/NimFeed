# NimFeed — Technical Design Spec

**Date:** 2026-05-05  
**Status:** Approved  
**Project:** NimFeed — on-chain microblogging on Nimiq 2.0 (Albatross)

---

## Overview

NimFeed is a fully on-chain microblogging platform (Twitter-like) built on Nimiq 2.0 Albatross. There is no backend. The blockchain is the source of truth. All app state is reconstructed client-side from transaction data stored in a browser IndexedDB. User identity is the Nimiq wallet address. Transactions are signed via Nimiq Hub and broadcast via JSON-RPC.

---

## Architecture: Hybrid Catalog + Per-User Namespace

### Core Idea

- **Catalog address** — a single well-known NimFeed address that acts as a thin discovery layer. It receives only: `USER_REG`, `USERNAME_CLAIM`, `POST_ANNOUNCE`.
- **User address** — each user's wallet address is their data namespace. All personal events (`PROFILE_SET`, `POST_START`, `POST_CHUNK`, `FOLLOW`, `UNFOLLOW`, `LIKE`, `UNLIKE`) are sent as self-transactions (sender == recipient == user address).

### Why This Split

- The catalog stays bounded per event type: one `USER_REG` per user registration, one `USERNAME_CLAIM` per claim attempt, one `POST_ANNOUNCE` per public post. It grows linearly with activity but contains no bulk data (no chunks, no profile data).
- User address data is naturally scoped. Per-user queries go directly to one address.
- Global discovery (global feed) is built from `POST_ANNOUNCE` entries in the catalog without scanning all user addresses.
- Follows feed is built by querying N followed user addresses in parallel.

### Catalog Growth

The catalog grows at one transaction per public post, plus one per user registration and username claim. This is bounded per post and linear with platform activity. For MVP scale (tens of thousands of users, millions of posts over years), full catalog sync is feasible in under a minute. Sharded catalogs are the designated future evolution path.

---

## 1. Binary Protocol

### 1.1 Header — 4 bytes (every transaction payload)

```
[0-1]  magic:   "NF" (0x4E 0x46)
[2]    version: uint8 = 0x01
[3]    type:    uint8
```

60 bytes remain for type-specific payload.

### 1.2 Event Type Registry

```
0x01  USER_REG
0x02  USERNAME_CLAIM
0x03  PROFILE_SET
0x04  POST_START
0x05  POST_CHUNK
0x06  POST_ANNOUNCE
0x07  FOLLOW
0x08  UNFOLLOW
0x09  LIKE
0x0A  UNLIKE
```

### 1.3 Routing Rules

Events must be sent to the correct destination or they are silently discarded by the indexer.

```
Sent TO catalog address:
  USER_REG, USERNAME_CLAIM, POST_ANNOUNCE

Sent AS self-tx (sender == recipient == user address):
  PROFILE_SET, POST_START, POST_CHUNK, FOLLOW, UNFOLLOW, LIKE, UNLIKE
```

The RPC response may use field names `sender`/`recipient` or `from`/`to` depending on the node version. The RPC client normalizes these to `tx.from` and `tx.to` before any handler sees them.

### 1.4 Payload Layouts

All multi-byte integers are little-endian unless noted.

---

#### `USER_REG` → to catalog

```
[4]     flags:    uint8 (reserved, 0x00)
[5-63]  reserved
```

Registers the sender as a NimFeed user. One transaction is sufficient. Sending multiple is idempotent; the first by `(block_height, tx_index)` is canonical.

---

#### `USERNAME_CLAIM` → to catalog

```
[4-35]  username: 32 bytes, null-terminated UTF-8 (max 31 chars before null)
[36-63] reserved
```

Username is normalized before storage (see §1.7). First claim by `(block_height, tx_index)` wins per normalized username string. All claims are stored separately for conflict recomputation.

---

#### `PROFILE_SET` → self-tx

```
[4]     flags:        uint8 (bit0=has_display_name, bit1=has_bio)
[5-28]  display_name: 24 bytes, null-terminated UTF-8 (max 23 chars)
[29-60] bio:          32 bytes, null-terminated UTF-8 (max 31 chars)
[61-63] reserved
```

Latest by `(block_height, tx_index)` is canonical. Sending a new `PROFILE_SET` replaces the previous one entirely.

---

#### `POST_START` → self-tx

```
[4-11]  post_id:           uint64 LE  (see §1.6)
[12]    total_chunks:      uint8      (number of POST_CHUNK txs that follow)
[13]    flags:             uint8      (bit0=compressed, bit1=is_reply)
[14-21] content_hash:      8 bytes    (first 8 bytes of SHA-256 over final encoded payload)
[22-29] reply_to_post_id:  uint64 LE  (zeros if not a reply)
[30-49] reply_to_author:   20 bytes binary address (zeros if not a reply)
[50-63] reserved
```

---

#### `POST_CHUNK` → self-tx

```
[4-11]  post_id:     uint64 LE  (must match a POST_START from same sender)
[12]    chunk_index: uint8      (0-based)
[13]    data_len:    uint8      (actual data bytes in this chunk, 0–50)
[14-63] data:        50 bytes   (only first data_len bytes are valid)
```

---

#### `POST_ANNOUNCE` → to catalog

```
[4-11]  post_id: uint64 LE
[12]    flags:   uint8 (reserved, 0x00)
[13-63] reserved
```

The author is `tx.from` (the transaction sender). No author field in the payload. When resolving the post, fetch `tx.from`'s address and require that the matching `POST_START` is also a self-tx from the same address.

---

#### `FOLLOW` → self-tx

```
[4-23]  target_address: 20 bytes binary address
[24-63] reserved
```

---

#### `UNFOLLOW` → self-tx

```
[4-23]  target_address: 20 bytes binary address
[24-63] reserved
```

Latest event for the `(sender, target)` pair by `(block_height, tx_index)` determines active follow state.

---

#### `LIKE` → self-tx

```
[4-11]  post_id:     uint64 LE
[12-31] post_author: 20 bytes binary address
[32-63] reserved
```

---

#### `UNLIKE` → self-tx

```
[4-11]  post_id:     uint64 LE
[12-31] post_author: 20 bytes binary address
[32-63] reserved
```

Latest event for `(liker, post_author, post_id)` by `(block_height, tx_index)` determines active like state.

### 1.5 Post Encoding Pipeline

```
input: text string (max 280 UTF-8 chars)

1. raw     = new TextEncoder().encode(text)
2. comp    = await deflateRaw(raw)          // CompressionStream('deflate-raw')
3. payload = comp.length < raw.length ? comp : raw
4. flags.bit0 = (payload === comp) ? 1 : 0
5. digest  = await crypto.subtle.digest('SHA-256', payload)
6. content_hash = new Uint8Array(digest).slice(0, 8)
7. chunks  = splitInto50ByteChunks(payload)
8. total_chunks = chunks.length
```

`CompressionStream('deflate-raw')` browser support: Chrome 80+, Firefox 113+, Safari 16.4+. Detect at runtime with a try/catch; fall back to raw bytes if unavailable (flags.bit0 stays 0). The decoder handles both transparently via the compressed flag.

**Typical transaction costs after compression:**

| Post length      | Compressed bytes | Chunks | Total txs (incl. START + ANNOUNCE) |
|------------------|-----------------|--------|--------------------------------------|
| 80-char ASCII    | ~65             | 2      | 4                                    |
| 160-char ASCII   | ~115            | 3      | 5                                    |
| 280-char ASCII   | ~160            | 4      | 6                                    |
| 280-char emoji   | ~180            | 4      | 6                                    |

### 1.6 `post_id` Generation

```javascript
function generatePostId() {
  const buf  = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(Date.now() / 1000), true)  // unix seconds, LE
  view.setUint32(4, crypto.getRandomValues(new Uint32Array(1))[0], true)  // random, LE
  return buf
}
```

- The seconds component provides approximate chronological ordering.
- The random component prevents same-second collisions across devices.
- Global canonical post ID: `(author_address_20_bytes, post_id_8_bytes)` = 28 bytes.
- Stored in IndexedDB as a 16-char zero-padded big-endian hex string so string sort equals chronological sort.
- Canonical feed ordering is always `(block_height, tx_index)`, not `post_id`. The `post_id` seconds part is metadata only.

### 1.7 Username Normalization

```javascript
function normalizeUsername(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (s.length < 3 || s.length > 31) return null
  return s
}
```

Allowed characters: `a-z`, `0-9`, `_`. Length 3–31. Invalid usernames are silently dropped during indexing. Conflict resolution: for a given normalized username, the claim with the lowest `(block_height, tx_index)` is the winner. All claims are stored in `username_claims` for recomputation.

### 1.8 Post Status Model

```
pending        POST_START seen, chunks still arriving
complete       all chunks received, SHA-256 prefix verified
invalid_hash   all chunks received, hash mismatch — discarded silently
missing_chunks POST_START seen, 48+ blocks elapsed without all chunks
failed         local-only: broadcast aborted before POST_START landed on chain
reorged        local-only: tx_hash no longer present after reorg re-check
```

`missing_chunks` is a UI hint only. The post record is never permanently deleted. If missing chunks arrive later (slow sync, multiple devices), the status upgrades to `complete`. The 48-block threshold (~4 minutes on Albatross) only controls when the UI stops showing a loading spinner.

### 1.9 Canonical Ordering

All feeds and state resolution use `(block_height ASC, tx_index ASC)`. Both fields are present in every Nimiq RPC transaction response. Latest-wins state (FOLLOW, LIKE, PROFILE_SET) takes the maximum `(block_height, tx_index)`.

---

## 2. Data Model (IndexedDB)

Database name: `nimfeed-v1`. Managed via Dexie.js.

### 2.1 `users`

```
keyPath: address  (NQ-format string)

fields:
  address              string
  display_name         string | null
  bio                  string | null
  registered_height    number | null   // block_height of first USER_REG
  username             string | null   // cached from username_claims resolution
  username_height      number | null   // block_height of winning claim
  username_tx_index    number | null   // tx_index of winning claim
  last_synced_height   number

indexes:
  username
```

### 2.2 `username_claims`

```
keyPath: [username, address]  (compound)

fields:
  username     string   // normalized
  address      string   // NQ claimant address
  block_height number
  tx_index     number
  tx_hash      string

indexes:
  username               // all claims for a username → pick lowest (block_height, tx_index)
  address                // all usernames claimed by an address
```

Username resolution always queries this store and never trusts the cached `users.username` alone — the cache is populated after resolution and invalidated when new claims arrive.

### 2.3 `posts`

```
keyPath: [author, post_id]  (compound — author=NQ string, post_id=16-char hex)

fields:
  author             string
  post_id            string           // 16-char big-endian hex
  block_height       number
  tx_index           number
  content            string | null    // null until complete
  total_chunks       number | null    // null if POST_START not yet seen
  chunks_received    number
  compressed         boolean
  content_hash       string           // 16-char hex (8 bytes)
  is_reply           boolean
  reply_to_author    string | null
  reply_to_post_id   string | null    // 16-char hex
  status             'pending' | 'complete' | 'invalid_hash' | 'missing_chunks' | 'failed' | 'reorged'
  first_seen_at      number           // block_height when first event (START or CHUNK) arrived

indexes:
  block_height
  author
  status
  [reply_to_author, reply_to_post_id]
```

### 2.4 `post_chunks`

```
keyPath: [author, post_id, chunk_index]

fields:
  author       string
  post_id      string       // 16-char hex
  chunk_index  number
  data         Uint8Array
  data_len     number
```

Chunks are deleted after successful assembly into `posts.content`.

### 2.5 `follows`

```
keyPath: [follower, followee]

fields:
  follower      string
  followee      string
  active        boolean
  block_height  number
  tx_index      number

indexes:
  follower
  followee
```

### 2.6 `likes`

```
keyPath: [liker, post_author, post_id]

fields:
  liker        string
  post_author  string
  post_id      string    // 16-char hex
  active       boolean
  block_height number
  tx_index     number

indexes:
  [post_author, post_id]
  liker
```

### 2.7 `catalog_refs`

```
keyPath: tx_hash  (string)

fields:
  tx_hash      string
  type         'USER_REG' | 'USERNAME_CLAIM' | 'POST_ANNOUNCE'
  sender       string          // NQ address (= tx.from)
  post_id      string | null   // 16-char hex, POST_ANNOUNCE only
  username     string | null   // normalized, USERNAME_CLAIM only
  block_height number
  tx_index     number
  seen_at      number          // Date.now() ms

indexes:
  type
  sender
  [type, block_height, tx_index]
  [sender, type]
```

### 2.8 `sync_state`

```
keyPath: address

fields:
  address               string
  scope                 'catalog' | 'user'
  newest_seen_tx_hash   string | null   // stop marker for delta sync
  oldest_synced_cursor  string | null   // startAt for backfill pagination
  fully_synced          boolean
  last_synced_at        number          // Date.now() ms
```

**Delta sync** (app focus / tab resume — gets new txs only):
```
fetch page(address, 500, startAt=null)     // newest first
stop when tx.hash === newest_seen_tx_hash
update newest_seen_tx_hash = page[0].hash
```

**Backfill** (initial load or scroll to older history):
```
fetch page(address, 500, startAt=oldest_synced_cursor)
process all
update oldest_synced_cursor = page[page.length - 1].hash
if page.length < 500: fully_synced = true
```

---

## 3. Local Lazy Indexer

### 3.1 Architecture

A singleton `IndexerService` class instantiated once on app mount. Runs on the main thread in micro-task batches (no web worker for MVP). Exposes `syncCatalog()`, `syncUser(address)`, `startDeltaSync()`. Emits progress events via `EventTarget` that composables subscribe to.

### 3.2 Address Validation

Applied before any handler runs:

```javascript
function isValidCatalogEvent(tx) {
  return tx.to === CATALOG_ADDRESS
}

function isValidSelfTx(tx) {
  return tx.from === tx.to
}
```

RPC field normalization in `rpc.js`:

```javascript
function normalizeTransaction(raw) {
  return {
    hash:             raw.hash,
    from:             raw.sender    ?? raw.from,
    to:               raw.recipient ?? raw.to,
    value:            raw.value,
    data:             raw.data ?? raw.extraData ?? '',
    blockHeight:      raw.blockNumber ?? raw.blockHeight,
    transactionIndex: raw.transactionIndex ?? 0,
    timestamp:        raw.timestamp,
  }
}
```

### 3.3 Event Dispatch

```javascript
function processTransaction(tx) {
  const hex = tx.data
  if (!hex || hex.length < 8) return
  if (hex.slice(0, 4) !== '4e46') return   // "NF" magic, fast path

  const bytes   = hexToBytes(hex)
  const version = bytes[2]
  const type    = bytes[3]
  if (version !== 0x01) return

  switch (type) {
    case 0x01: if (isValidCatalogEvent(tx)) handleUserReg(tx, bytes);        break
    case 0x02: if (isValidCatalogEvent(tx)) handleUsernameClaim(tx, bytes);  break
    case 0x03: if (isValidSelfTx(tx))       handleProfileSet(tx, bytes);     break
    case 0x04: if (isValidSelfTx(tx))       handlePostStart(tx, bytes);      break
    case 0x05: if (isValidSelfTx(tx))       handlePostChunk(tx, bytes);      break
    case 0x06: if (isValidCatalogEvent(tx)) handlePostAnnounce(tx, bytes);   break
    case 0x07:
    case 0x08: if (isValidSelfTx(tx))       handleFollow(tx, bytes);         break
    case 0x09:
    case 0x0A: if (isValidSelfTx(tx))       handleLike(tx, bytes);           break
  }
}
```

### 3.4 Out-of-Order Chunk Handling

POST_CHUNK transactions may arrive (be indexed) before their POST_START. Both orderings are handled:

**Chunk arrives first:**
- Store chunk in `post_chunks`
- If no post record exists: create a placeholder with `total_chunks: null`, `status: 'pending'`
- When POST_START arrives later: fill in `total_chunks`, call `tryAssemble()`

**POST_START arrives first (normal case):**
- Create or update post record with `total_chunks`
- Call `tryAssemble()` — completes immediately if all chunks already stored

### 3.5 Chunk Assembly

```javascript
async function tryAssemble(author, post_id) {
  const post   = await db.posts.get([author, post_id])
  if (!post || post.total_chunks === null) return
  if (post.chunks_received < post.total_chunks) return

  const chunks  = await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, post_id, 0], [author, post_id, 255])
    .sortBy('chunk_index')

  const encoded = concatChunkData(chunks)

  // Verify hash BEFORE decompression
  const digest  = await crypto.subtle.digest('SHA-256', encoded)
  const hash8   = new Uint8Array(digest).slice(0, 8)
  if (!bytesEqual(hash8, hexToBytes(post.content_hash))) {
    await db.posts.update([author, post_id], { status: 'invalid_hash' })
    return
  }

  const payload = post.compressed ? await inflateRaw(encoded) : encoded
  const content = new TextDecoder().decode(payload)

  await db.posts.update([author, post_id], { status: 'complete', content })
  await db.post_chunks.where('[author+post_id+chunk_index]')
    .between([author, post_id, 0], [author, post_id, 255])
    .delete()
}
```

### 3.6 Catalog Sync Strategy

1. On app mount: run delta sync (get new txs since `newest_seen_tx_hash`)
2. If `fully_synced === false`: continue backfill in background
3. On tab focus (visibilitychange): run delta sync
4. On scroll to end of global feed: trigger next backfill page

### 3.7 User Address Sync Strategy

- Triggered lazily when the UI needs data from an address (profile view, following feed, post resolution)
- On first trigger: fetch newest page → process → store cursor
- On subsequent triggers: delta sync only (newest page, stop at cursor)
- Full backfill: triggered by scroll to older history in profile/following feed
- Addresses not viewed in 7 days are not re-synced automatically

**Following feed optimization:** When building the following feed, sync only the newest page for each followed address first. Full backfill for each followee happens only when the user scrolls into older history. This keeps initial following feed load to N single-page fetches rather than N full backfills.

### 3.8 Sync Budget

- Max 2,000 transactions processed per sync tick before yielding to event loop (`setTimeout(0)`)
- Max 10 seconds wall-clock time per background sync session
- If budget exceeded mid-page: save cursor at current page boundary, resume next tick

### 3.9 Reorg Handling

Nimiq Albatross uses BFT consensus — practical finality is near-instant. Minimal handling is sufficient for MVP:

- Posts are displayed as **tentative** (subtle UI indicator) until `current_tip - post.block_height >= 10`
- On app load: re-fetch the most recent 50 blocks of transactions from the catalog address and any locally-authored addresses. Compare `tx_hash` against stored records.
- If a stored `tx_hash` is no longer present: mark affected records `status: 'reorged'`, remove from feed silently.
- No full reindex required — only the last 50-block window is re-checked.

---

## 4. Posting Flow

### 4.1 First-Time Onboarding

```
1. Hub login → receive address
2. Send USER_REG → to CATALOG_ADDRESS           (1 tx, 1 Luna)
3. (Optional) Send USERNAME_CLAIM → to CATALOG  (1 tx, 1 Luna)
4. Send PROFILE_SET → self-tx                   (1 tx, 1 Luna)
```

Steps 2–4 require 1–3 Hub signing popups. Shown as a guided onboarding flow in the UI.

### 4.2 Post Creation — Happy Path

```
1. User writes text (max 280 chars, enforced in composer UI)

2. ENCODE
   raw     = new TextEncoder().encode(text)
   comp    = await deflateRaw(raw)
   payload = comp.length < raw.length ? comp : raw
   flags   = (payload === comp) ? 0x01 : 0x00

3. HASH
   digest       = await crypto.subtle.digest('SHA-256', payload)
   content_hash = new Uint8Array(digest).slice(0, 8)

4. CHUNK
   chunks       = splitInto50(payload)
   total_chunks = chunks.length

5. GENERATE ID
   post_id_buf = generatePostId()   // seconds LE u32 + random LE u32
   post_id_hex = toHex64BE(post_id_buf)

6. BUILD TRANSACTIONS
   tx[0] = buildSelfTx(POST_START payload, 1 Luna)
   tx[1..N] = chunks.map((c, i) => buildSelfTx(POST_CHUNK payload(i), 1 Luna))
   tx[N+1] = buildCatalogTx(POST_ANNOUNCE payload, 1 Luna)

7. SHOW CONFIRMATION DIALOG
   "This post requires {N+2} transactions ({N+2} Luna)"
   User clicks Confirm

8. SIGN SEQUENTIALLY via Hub
   signed = []
   for each tx:
     result = await hub.signTransaction(tx)
     signed.push(result)

9. OPTIMISTIC LOCAL WRITE
   db.posts.put({ author, post_id_hex, status: 'pending', content: text, ... })
   // Post appears in profile feed immediately

10. BROADCAST SEQUENTIALLY (START first, chunks in order, ANNOUNCE last)
    for each signedTx:
      await rpc.sendRawTransaction(signedTx.serialized)

11. CONFIRMATION WATCH
    poll rpc.getTransactionByHash(tx_announce.hash) every 5s
    on confirmed (tx in a block): post.status = 'complete'
    on timeout (120s): show "Confirmation taking longer than expected" + retry
```

### 4.3 Edge Cases

| Situation | Behavior |
|---|---|
| Hub popup rejected mid-sequence | Signed txs already broadcast stay on chain as orphan chunks. POST_START not broadcast → post rolled back to `failed` in local DB. UI shows "Post failed — retry?" |
| RPC broadcast fails after signing | Signed txs held in memory. Retry button re-broadcasts without re-signing. |
| Tab closed during broadcast | Orphan chunks may land on chain. If POST_ANNOUNCE never lands, post never appears in global feed. User can re-post with a new `post_id`. Old orphans appear as `missing_chunks` and are hidden after 48 blocks. |
| Duplicate `post_id` (random collision) | Both POST_STARTs land on chain. Lower `(block_height, tx_index)` is canonical; the other is discarded. |

---

## 5. Feed Construction

### 5.1 Global Feed

```
Source: catalog_refs WHERE type='POST_ANNOUNCE'
Sort:   (block_height DESC, tx_index DESC)
Page:   20 records at a time from IndexedDB

For each catalog_ref:
  post = db.posts.get([catalog_ref.sender, catalog_ref.post_id])
  'complete':      render PostCard
  'pending':       render PostSkeleton, trigger syncUser(catalog_ref.sender)
  undefined:       render PostSkeleton, trigger syncUser(catalog_ref.sender)
  'invalid_hash':  skip
  'missing_chunks': render "Post unavailable"
```

Skeletons upgrade to full cards reactively once the background sync assembles the post.

### 5.2 Profile Feed

```
1. syncUser(address) if stale > 5 min
2. db.posts.index('author').getAll(address)
3. filter: status === 'complete'
4. sort: (block_height DESC, tx_index DESC)
5. paginate: 20 per page
```

### 5.3 Following Feed

```
1. followees = db.follows.index('follower').getAll(currentUser)
              .filter(f => f.active).map(f => f.followee)

2. For each followee:
   - syncUser(followee, { latestPageOnly: true })   // fast: one page per address
   - full backfill deferred until user scrolls to older history

3. pages = await Promise.all(
     followees.map(addr =>
       db.posts.index('author').getAll(addr, { status: 'complete' })
     )
   )
   merged = pages.flat().sort((a, b) =>
     b.block_height - a.block_height || b.tx_index - a.tx_index
   )

4. paginate: take first 20, next 20 on scroll
```

### 5.4 Partial Post Handling

| Status | UI |
|---|---|
| `pending` | Skeleton card with spinner |
| `missing_chunks` | "Post unavailable" with retry icon |
| `invalid_hash` | Hidden — no UI surface |
| Reply with missing parent | "Replying to @username" without parent embed |

### 5.5 Caching Strategy

IndexedDB is the primary cache. Pinia stores hold the active feed page slice (≤50 posts) as reactive state. On feed switch, the slice is cleared and reloaded from IndexedDB. No separate in-memory cache layer for MVP.

---

## 6. Spam & UX Strategy

### 6.1 Economics

Each NimFeed transaction costs 1 Luna. Negligible per post, but non-zero. Bulk spam (1,000 posts) costs 5,000–6,000 Luna. This deters casual spam without preventing normal use.

### 6.2 Default UI Filters

Applied client-side. No protocol changes required.

| Filter | Default | Notes |
|---|---|---|
| Hide posts from addresses with no `USER_REG` | ON | Requires intentional setup |
| Hide posts from addresses < 10 blocks old | ON | Deters throwaway wallets |
| Minimum account balance 1,000 Luna | OFF | User-configurable |
| Show only followed accounts in global feed | OFF | Opt-in |

### 6.3 Username Spam

USERNAME_CLAIM costs 1 Luna. First-claim-wins creates a natural Schelling point. Squatting hundreds of usernames is linearly expensive.

### 6.4 Feed Poisoning

Spammers must send one catalog transaction per post. Bulk catalog spam becomes visible in the UI as "N new posts from unknown accounts" and triggers the account-age filter.

### 6.5 MVP Defaults

Global feed shows all valid posts from registered users, with account-age filter enabled. Sorting is pure chronological (`block_height, tx_index`). No algorithmic ranking in MVP.

---

## 7. Frontend Architecture

### 7.1 Tech Stack

| Tool | Version | Notes |
|---|---|---|
| Vue 3 | 3.5.x | Composition API, `<script setup>` |
| Vite | 8.x | `@vitejs/plugin-vue` |
| Tailwind CSS | 4.x | `@tailwindcss/vite` |
| Pinia | 3.x | State management |
| Dexie.js | 4.x | IndexedDB abstraction |
| @nimiq/hub-api | ^1.13.0 | Wallet auth + tx signing |
| JavaScript | ES2022 | No TypeScript (matches existing projects) |

### 7.2 Folder Structure

```
src/
├── main.js
├── App.vue
│
├── protocol/
│   ├── constants.js        // CATALOG_ADDRESS, magic bytes, type codes, VERSION
│   ├── encoder.js          // buildUserReg, buildPostStart, buildPostChunk, etc.
│   ├── decoder.js          // parseTransaction → typed event object
│   └── compression.js      // deflateRaw / inflateRaw wrappers (feature-detected)
│
├── chain/
│   ├── rpc.js              // NimiqRPC class — getTransactionsByAddress, sendRawTransaction
│   │                       // normalizeTransaction (handles sender/recipient vs from/to)
│   └── hub.js              // useHub — signMessage (auth), signTransaction (posting)
│
├── db/
│   ├── schema.js           // Dexie instance, all 8 stores + indexes
│   └── queries.js          // typed helpers: getPosts, getFollows, getLikes, etc.
│
├── indexer/
│   ├── IndexerService.js   // singleton sync engine
│   ├── handlers.js         // handlePostStart, handlePostChunk, etc.
│   ├── assembler.js        // tryAssemble — chunk concat, hash verify, decompress
│   └── useIndexer.js       // Vue composable wrapping IndexerService
│
├── stores/
│   ├── auth.js             // Hub login state, current user address + profile
│   ├── feed.js             // active feed slice (global / profile / following)
│   └── ui.js               // modal state, filter settings, composer state
│
├── composables/
│   ├── usePost.js          // post creation: encode → sign → broadcast → watch
│   ├── useFeed.js          // feed loading + pagination + reactive updates
│   ├── useProfile.js       // profile resolution + edit flow
│   └── useFollow.js        // follow / unfollow actions + state
│
└── components/
    ├── layout/
    │   ├── AppShell.vue
    │   └── BottomNav.vue
    ├── feed/
    │   ├── FeedView.vue
    │   ├── PostCard.vue
    │   └── PostSkeleton.vue
    ├── post/
    │   ├── PostComposer.vue
    │   └── PostDetail.vue
    ├── profile/
    │   ├── ProfileView.vue
    │   └── ProfileCard.vue
    └── auth/
        ├── LoginModal.vue
        └── WalletButton.vue
```

### 7.3 Module Contracts

**`protocol/`** — pure functions, zero side effects, fully unit-testable without a browser environment.

**`chain/rpc.js`** — direct port of nimiq-doom's `NimiqRPC`. Add `sendRawTransaction(serializedHex)`. All responses pass through `normalizeTransaction()` before leaving the module.

**`chain/hub.js`** — port of nimiq-2048's `useHub`. Adds `signTransaction(txParams)` for data transactions. Warmup iframe on app mount (same pattern as nimiq-2048).

**`db/schema.js`** — single Dexie instance exported as singleton. Version upgrades handled declaratively. No raw IndexedDB calls outside this module.

**`indexer/IndexerService.js`** — singleton, started once. Emits `'post:complete'`, `'user:synced'`, `'catalog:updated'` events. Composables subscribe to react to background sync completions.

**`stores/auth.js`** — holds `{ address, displayName, username, registered }` for the logged-in user. Persists address hint to `localStorage` (same as nimiq-2048 pattern).

---

## 8. Phased Implementation Plan

### Phase 1 — Core MVP

**Scope:**
- Hub login / logout
- Onboarding: USER_REG → optional USERNAME_CLAIM → PROFILE_SET
- Post creation (POST_START + POST_CHUNK + POST_ANNOUNCE)
- Global feed (catalog scan → POST_ANNOUNCE entries)
- Profile view (per-address scan)
- Local indexer with dual-cursor sync (catalog + user addresses)
- All encoding/decoding for Phase 1 event types

**Deliverables (independently testable):**
- Feed is readable without logging in
- Posting testable on Nimiq testnet with a dedicated test catalog address
- Indexer testable by replaying recorded RPC fixture responses
- Protocol encoder/decoder unit-testable in isolation

**Out of scope for Phase 1:** follows, likes, replies, reply threads, notifications.

---

### Phase 2 — Social Graph

**Scope:**
- FOLLOW / UNFOLLOW flow + `follows` store
- Following feed (per-followee latest-page-first sync, backfill on scroll)
- User search by normalized username (from `username_claims` store)
- Profile card shows follower / following counts
- `useFollow` composable

**Deliverables:**
- Follow graph works from local IndexedDB
- Following feed degrades gracefully if some followed addresses have no synced posts
- Username search works offline from locally indexed claims

---

### Phase 3 — Reactions & Threads

**Scope:**
- LIKE / UNLIKE flow + `likes` store
- Like count display on post cards
- Reply composition (pre-fills `reply_to_*` fields in POST_START)
- Thread / reply chain view
- `[reply_to_author, reply_to_post_id]` index used for thread assembly

**Deliverables:**
- Like counts visible without being logged in
- Reply threads visible from profile feed and global feed
- Thread view works from IndexedDB without additional RPC calls if posts already synced

---

## 9. Risks & Tradeoffs

| Risk | Impact | Mitigation |
|---|---|---|
| No backend → full address history must be streamed | First sync of a prolific user (1,000+ posts) may take 30–60s | Dual-cursor lazy sync; UI renders cached content immediately; show progress |
| RPC rate limits on public endpoints | Sync stalls | Exponential backoff (nimiq-doom pattern); user-configurable RPC endpoint in settings |
| Hub requires one popup per transaction | 6 popups for a long post | Pre-post cost dialog; batch signing when Hub exposes it |
| Catalog grows with every public post | After millions of posts, initial catalog sync is slow | Linear growth is manageable for years; sharded catalogs planned for Phase N+1 |
| `post_id` clock skew | Posts appear out of order within a feed | `post_id` seconds is metadata; canonical order is always `(block_height, tx_index)` |
| Orphan chunks from failed posts | Clutter in user address txs | No impact on other users; local UI hides them after 48 blocks; no on-chain cleanup needed |
| Mobile browser memory constraints | Tab killed mid-sync | Feed Pinia slice capped at 50 posts; chunks deleted after assembly; sync state persisted to survive kill |
| `CompressionStream` not available in older browsers | Compression unavailable | Runtime feature detection; graceful fallback to raw bytes; no data loss |

---

## 10. Future Evolution

**Optional backend indexer** — can be added without breaking the trust model. Any indexer is a client that has pre-synced. The browser client retains the canonical source (the chain) and can verify indexer output against it. The indexer exposes the same logical queries (feed, profile, likes) but pre-computed.

**Sharded catalogs** — when catalog sync becomes slow, introduce a shard byte derived from `sender_address[0] & 0x0F` (16 shards). Old clients continue reading the original catalog. New clients read both. The protocol version byte in the header is the migration lever.

**Richer media** — avatar URLs: new event type `AVATAR_SET` (self-tx) carrying a content-addressed URL hash. Full images: chunk protocol identical to nimiq-doom's CART/DATA pattern, adapted to NimFeed addresses. Out of scope for the three MVP phases.

**Compression upgrade** — switch `deflate-raw` to Brotli when `CompressionStream('br')` has broad browser support. New flag value in POST_START flags byte. Old decoders treat unknown flag combinations as uncompressed.

**Verified usernames** — a trusted NimFeed registrar address co-signs USERNAME_CLAIM events. UI marks verified usernames with a badge. Protocol-compatible addition requiring no changes to existing event types.

**Profile chunking** — `PROFILE_START` / `PROFILE_CHUNK` events following the same pattern as post chunking, for longer bios, avatar hashes, and website URLs. The simple `PROFILE_SET` event from Phase 1 remains valid; chunked profiles add capability without breaking existing clients.
