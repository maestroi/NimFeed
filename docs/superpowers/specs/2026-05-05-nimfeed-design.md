# NimFeed — Technical Design Spec

**Date:** 2026-05-05  
**Status:** Approved (v2 — simplified architecture)  
**Project:** NimFeed — on-chain microblogging on Nimiq 2.0 (Albatross)

---

## Overview

NimFeed is a fully on-chain microblogging platform (Twitter-like) built on Nimiq 2.0 Albatross. There is no backend. The blockchain is the source of truth. All app state is reconstructed client-side from transaction data stored in a browser IndexedDB. User identity is the Nimiq wallet address. Transactions are signed via Nimiq Hub and broadcast via JSON-RPC.

**Note:** Nimiq does not support self-transactions (sender == recipient). NimFeed never designs around self-tx. All on-chain events are sent to well-known catalog addresses or deterministic derived addresses.

---

## Architecture: Catalog + Derived Post Addresses

### Core Idea

- **POST_CATALOG_ADDRESS** — a single well-known NimFeed address for global discovery. Receives only: `PROFILE_CLAIM`, `POST_INLINE`, `POST_START`. One event per user action. Stays bounded and fast to sync.
- **FOLLOW_CATALOG_ADDRESS** — a separate well-known address for social graph events. Receives: `FOLLOW`, `UNFOLLOW`. Kept separate so follow-graph sync is independent of post-catalog sync.
- **Derived post address** — a deterministic address computed per post (`author_address + post_id + "nimfeed"`). `POST_CHUNK` transactions go here, off the main catalog. NIM sent to this address is effectively locked (no private key), serving as the per-chunk cost mechanism.

### Why This Split

- The post catalog stays small: one transaction per post (the announcement/start), one per profile claim. No bulk data.
- Post chunk data lives at derived addresses — one address per post. Chunks are fetched on demand when rendering a post.
- Global feed is built from the post catalog without scanning user addresses.
- Profile feed is built from the post catalog filtered by `tx.from`.
- Following feed is built from follow catalog (to get followee list) + post catalog (to get their posts).
- No per-user address sync required.

### Catalog Growth

Post catalog: one transaction per public post plus one per profile claim. Linear with activity, no bulk data. For MVP scale (tens of thousands of users, millions of posts over years), full catalog sync is feasible. Sharded catalogs are the designated future evolution path.

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
0x01  PROFILE_CLAIM
0x02  POST_INLINE
0x03  POST_START
0x04  POST_CHUNK
0x05  FOLLOW
0x06  UNFOLLOW
```

### 1.3 Routing Rules

Events must be sent to the correct destination or they are silently discarded by the indexer.

```
Sent TO POST_CATALOG_ADDRESS:
  PROFILE_CLAIM, POST_INLINE, POST_START

Sent TO DERIVED_POST_ADDRESS (computed from author + post_id):
  POST_CHUNK

Sent TO FOLLOW_CATALOG_ADDRESS:
  FOLLOW, UNFOLLOW
```

The RPC response may use field names `sender`/`recipient` or `from`/`to` depending on the node version. The RPC client normalizes these to `tx.from` and `tx.to` before any handler sees them.

### 1.4 Payload Layouts

All multi-byte integers are little-endian unless noted.

---

#### `PROFILE_CLAIM` → to POST_CATALOG_ADDRESS

```
[4-35]  username:     32 bytes, null-terminated UTF-8 (max 31 chars before null)
[36-59] display_name: 24 bytes, null-terminated UTF-8 (max 23 chars before null)
[60-63] reserved
```

Username resolution: the earliest valid `PROFILE_CLAIM` for a given normalized username (by `block_height, tx_index`) is the winner. All claims are stored for recomputation.

Display name resolution: the latest valid `PROFILE_CLAIM` from the winning address for that username. Sending a new `PROFILE_CLAIM` with the same username updates the display name; the username ownership is unchanged (the original claim still wins by timestamp).

Onboarding cost: **1 transaction**.

---

#### `POST_INLINE` → to POST_CATALOG_ADDRESS

Used for short posts that fit in a single transaction.

**Layout — no reply (flags bit0 = 0):**

```
[4-11]  post_id:  uint64 LE
[12]    flags:    uint8  (bit0=is_reply, bit1=reserved)
[13-63] text:     51 bytes, raw UTF-8 (null-terminated or full; trailing nulls ignored)
```

Max content: 51 bytes (~51 ASCII chars, fewer for multi-byte).

**Layout — with reply (flags bit0 = 1):**

```
[4-11]  post_id:           uint64 LE
[12]    flags:             uint8  (bit0=is_reply=1)
[13-32] reply_to_author:   20 bytes binary address
[33-40] reply_to_post_id:  uint64 LE
[41-63] text:              23 bytes, raw UTF-8
```

Post cost: **1 transaction**.

---

#### `POST_START` → to POST_CATALOG_ADDRESS

Used for normal/long posts. Serves as both the post announcement and the metadata header.

```
[4-11]  post_id:           uint64 LE
[12]    total_chunks:      uint8  (number of POST_CHUNK txs to follow)
[13]    flags:             uint8  (bit0=compressed, bit1=is_reply)
[14-21] content_hash:      8 bytes (first 8 bytes of SHA-256 over final encoded payload)
[22-41] reply_to_author:   20 bytes binary address (zeros if not a reply)
[42-49] reply_to_post_id:  uint64 LE (zeros if not a reply)
[50-63] reserved
```

The author is `tx.from`. There is no separate `POST_ANNOUNCE` — `POST_START` in the catalog is the global discovery event.

Post cost: **1 catalog tx + N chunk txs**.

---

#### `POST_CHUNK` → to DERIVED_POST_ADDRESS

```
[4-11]  post_id:     uint64 LE  (must match a POST_START from same sender in catalog)
[12]    chunk_index: uint8      (0-based)
[13]    data_len:    uint8      (actual data bytes in this chunk, 0–50)
[14-63] data:        50 bytes   (only first data_len bytes are valid)
```

Validation:
- `tx.from` must equal the author of the matching `POST_START` in the catalog.
- `tx.to` must equal `derivePostAddress(tx.from, post_id)`.

---

#### `FOLLOW` → to FOLLOW_CATALOG_ADDRESS

```
[4-23]  target_address: 20 bytes binary address (the account being followed)
[24-63] reserved
```

The follower is `tx.from`.

---

#### `UNFOLLOW` → to FOLLOW_CATALOG_ADDRESS

```
[4-23]  target_address: 20 bytes binary address
[24-63] reserved
```

Latest event for `(tx.from, target_address)` pair by `(block_height, tx_index)` determines active follow state.

### 1.5 Post Encoding Pipeline

```
input: text string

1. raw     = new TextEncoder().encode(text)

For POST_INLINE:
  - if raw.length ≤ 51 (no reply) or raw.length ≤ 23 (reply): use POST_INLINE
  - no compression; store raw bytes directly

For POST_START + POST_CHUNK:
  2. comp    = await deflateRaw(raw)          // CompressionStream('deflate-raw')
  3. payload = comp.length < raw.length ? comp : raw
  4. flags.bit0 = (payload === comp) ? 1 : 0
  5. digest  = await crypto.subtle.digest('SHA-256', payload)
  6. content_hash = new Uint8Array(digest).slice(0, 8)
  7. chunks  = splitInto50ByteChunks(payload)
  8. total_chunks = chunks.length
```

`CompressionStream('deflate-raw')` browser support: Chrome 80+, Firefox 113+, Safari 16.4+. Detect at runtime with a try/catch; fall back to raw bytes if unavailable.

**Typical transaction costs after compression:**

| Post length       | Encoding       | Total txs |
|-------------------|----------------|-----------|
| ≤51 chars ASCII   | POST_INLINE    | 1         |
| 80-char ASCII     | START + 2 chunks | 3       |
| 160-char ASCII    | START + 3 chunks | 4       |
| 280-char ASCII    | START + 4 chunks | 5       |
| 280-char emoji    | START + 4 chunks | 5       |

The UI must show transaction count before signing.

### 1.6 `post_id` Generation

```javascript
function generatePostId() {
  const buf  = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(Date.now() / 1000), true)  // unix seconds, LE
  view.setUint32(4, crypto.getRandomValues(new Uint32Array(1))[0], true)  // random, LE
  return new Uint8Array(buf)
}
```

- The seconds component provides approximate chronological ordering.
- The random component prevents same-second collisions.
- Global canonical post ID: `(author_address_20_bytes, post_id_8_bytes)` = 28 bytes.
- Stored in IndexedDB as a 16-char zero-padded big-endian hex string so string sort equals chronological sort.
- Canonical feed ordering is always `(block_height, tx_index)`, not `post_id`.

### 1.7 Username Normalization

```javascript
function normalizeUsername(raw) {
  const s = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (s.length < 3 || s.length > 31) return null
  return s
}
```

Allowed characters: `a-z`, `0-9`, `_`. Length 3–31. Invalid usernames are silently dropped during indexing.

### 1.8 Derived Post Address

```javascript
async function derivePostAddress(authorAddressBytes20, postIdBytes8) {
  const salt   = new TextEncoder().encode('nimfeed')         // 7 bytes
  const seed   = new Uint8Array(20 + 8 + salt.length)
  seed.set(authorAddressBytes20, 0)
  seed.set(postIdBytes8, 20)
  seed.set(salt, 28)
  const hash   = await crypto.subtle.digest('SHA-256', seed)
  return new Uint8Array(hash).slice(0, 20)                   // 20 bytes → NQ address
}
```

The derived address has no corresponding private key. NIM sent there is locked permanently; this is the intended per-chunk cost model (1 Luna per chunk). The transactions are queryable by address via JSON-RPC.

### 1.9 Post Status Model

```
pending        POST_START seen in catalog, chunks still arriving
complete       all chunks received, SHA-256 prefix verified
inline         POST_INLINE received, complete immediately
invalid_hash   all chunks received, hash mismatch — discarded silently
missing_chunks POST_START seen, 48+ blocks elapsed without all chunks
failed         local-only: broadcast aborted before POST_START landed on chain
reorged        local-only: tx_hash no longer present after reorg re-check
```

`missing_chunks` is a UI hint only. The post record is never permanently deleted.

### 1.10 Canonical Ordering

All feeds and state resolution use `(block_height ASC, tx_index ASC)`. Both fields are present in every Nimiq RPC transaction response. Latest-wins state (FOLLOW, PROFILE_CLAIM display_name) takes the maximum `(block_height, tx_index)`.

---

## 2. Data Model (IndexedDB)

Database name: `nimfeed-v1`. Managed via Dexie.js.

### 2.1 `profile_claims`

Stores all PROFILE_CLAIM events for conflict resolution. One row per `(username, address)` pair; updated if the same address re-claims the same username.

```
keyPath: [username, address]  (compound)

fields:
  username       string   // normalized
  address        string   // NQ claimant (tx.from)
  display_name   string   // from payload bytes [36-59]
  block_height   number
  tx_index       number
  tx_hash        string

indexes:
  username               // all claims for a username → pick lowest (block_height, tx_index)
  address                // all claims by an address
```

Username resolution: for each normalized username, the claim with the lowest `(block_height, tx_index)` wins. Display name: take the `display_name` from the winner's latest claim by block height.

### 2.2 `users`

Derived cache. Populated/updated after resolving `profile_claims`. Do not trust as canonical; always recompute from `profile_claims` when freshness matters.

```
keyPath: address  (NQ-format string)

fields:
  address              string
  display_name         string | null
  username             string | null   // winning normalized username
  username_height      number | null   // block_height of winning claim
  username_tx_index    number | null   // tx_index of winning claim
  last_synced_height   number

indexes:
  username
```

No `bio` field in V1.

### 2.3 `posts`

```
keyPath: [author, post_id]  (compound — author=NQ string, post_id=16-char hex)

fields:
  author             string
  post_id            string           // 16-char big-endian hex
  block_height       number
  tx_index           number
  content            string | null    // null until complete (POST_START posts)
  total_chunks       number | null    // null for POST_INLINE posts
  chunks_received    number           // 0 for POST_INLINE posts
  compressed         boolean          // always false for POST_INLINE
  content_hash       string | null    // 16-char hex; null for POST_INLINE
  is_inline          boolean          // true = POST_INLINE, immediate content
  is_reply           boolean
  reply_to_author    string | null    // NQ format
  reply_to_post_id   string | null    // 16-char hex
  status             'inline' | 'pending' | 'complete' | 'invalid_hash' | 'missing_chunks' | 'failed' | 'reorged'
  first_seen_at      number           // block_height when first event arrived

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
  follower      string   // tx.from (NQ format)
  followee      string   // target_address from payload (NQ format)
  active        boolean
  block_height  number
  tx_index      number

indexes:
  follower
  followee
```

### 2.6 `catalog_refs`

Records each event seen in the post catalog for feed construction and cursor tracking.

```
keyPath: tx_hash  (string)

fields:
  tx_hash      string
  type         'PROFILE_CLAIM' | 'POST_INLINE' | 'POST_START'
  sender       string          // NQ address (= tx.from)
  post_id      string | null   // 16-char hex; null for PROFILE_CLAIM
  username     string | null   // normalized; PROFILE_CLAIM only
  block_height number
  tx_index     number
  seen_at      number          // Date.now() ms

indexes:
  type
  sender
  [type, block_height, tx_index]
  [sender, type]
```

### 2.7 `sync_state`

```
keyPath: scope_key  (string)

fields:
  scope_key             string   // 'post_catalog' | 'follow_catalog' | 'post:NQ...' (derived address)
  newest_seen_tx_hash   string | null   // stop marker for delta sync
  oldest_synced_cursor  string | null   // startAt for backfill pagination
  fully_synced          boolean
  last_synced_at        number          // Date.now() ms
```

Derived post address sync entries (`scope_key = 'post:NQ...'`) are marked `fully_synced = true` once all chunks for the post are assembled. They are never re-synced.

**Delta sync** (tab focus / app resume):
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

A singleton `IndexerService` class instantiated once on app mount. Runs on the main thread in micro-task batches (no web worker for MVP). Exposes `syncPostCatalog()`, `syncFollowCatalog()`, `syncDerivedAddress(address)`, `startDeltaSync()`. Emits progress events via `EventTarget` that composables subscribe to.

### 3.2 Address Validation

```javascript
const POST_CATALOG_ADDRESS   = 'NQ...'   // well-known constant
const FOLLOW_CATALOG_ADDRESS = 'NQ...'   // well-known constant

function isPostCatalogEvent(tx) {
  return tx.to === POST_CATALOG_ADDRESS
}

function isFollowCatalogEvent(tx) {
  return tx.to === FOLLOW_CATALOG_ADDRESS
}

async function isValidChunkTx(tx, postIdBytes8) {
  const authorBytes  = nqToAddressBytes(tx.from)
  const derivedBytes = await derivePostAddress(authorBytes, postIdBytes8)
  const derivedNq    = addressBytesToNq(derivedBytes)
  return tx.to === derivedNq
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
function processPostCatalogTx(tx) {
  const hex = tx.data
  if (!hex || hex.length < 8) return
  if (hex.slice(0, 4) !== '4e46') return   // "NF" magic

  const bytes   = hexToBytes(hex)
  const version = bytes[2]
  const type    = bytes[3]
  if (version !== 0x01) return
  if (tx.to !== POST_CATALOG_ADDRESS) return

  switch (type) {
    case 0x01: handleProfileClaim(tx, bytes);  break
    case 0x02: handlePostInline(tx, bytes);    break
    case 0x03: handlePostStart(tx, bytes);     break
  }
}

function processFollowCatalogTx(tx) {
  // same magic/version checks
  if (tx.to !== FOLLOW_CATALOG_ADDRESS) return
  const type = hexToBytes(tx.data)[3]
  switch (type) {
    case 0x05: handleFollow(tx, hexToBytes(tx.data));   break
    case 0x06: handleUnfollow(tx, hexToBytes(tx.data)); break
  }
}

async function processDerivedAddressTx(tx, expectedDerivedNq) {
  // same magic/version checks
  if (tx.to !== expectedDerivedNq) return
  const bytes = hexToBytes(tx.data)
  if (bytes[3] !== 0x04) return   // must be POST_CHUNK
  await handlePostChunk(tx, bytes)
}
```

### 3.4 Post Inline Handling

`POST_INLINE` is complete on first sight. No chunk assembly needed.

```javascript
function handlePostInline(tx, bytes) {
  const postIdBytes = bytes.slice(4, 12)
  const postIdHex   = postIdToHex(postIdBytes)
  const flags       = bytes[12]
  const isReply     = !!(flags & 0x01)

  let replyToAuthor = null, replyToPostId = null, text
  if (isReply) {
    replyToAuthor = addressBytesToNq(bytes.slice(13, 33))
    replyToPostId = postIdToHex(bytes.slice(33, 41))
    text = new TextDecoder().decode(trimNulls(bytes.slice(41, 64)))
  } else {
    text = new TextDecoder().decode(trimNulls(bytes.slice(13, 64)))
  }

  db.posts.put({
    author:          tx.from,
    post_id:         postIdHex,
    block_height:    tx.blockHeight,
    tx_index:        tx.transactionIndex,
    content:         text,
    total_chunks:    null,
    chunks_received: 0,
    compressed:      false,
    content_hash:    null,
    is_inline:       true,
    is_reply:        isReply,
    reply_to_author: replyToAuthor,
    reply_to_post_id: replyToPostId,
    status:          'inline',
    first_seen_at:   tx.blockHeight,
  })
}
```

### 3.5 Post Start + Chunk Handling

When `handlePostStart` processes a `POST_START` from the catalog:
1. Creates or updates the post record with `total_chunks`, `content_hash`, `flags`.
2. Schedules a sync of the derived post address: `syncDerivedAddress(derivedNq)`.
3. Calls `tryAssemble()` in case chunks already arrived.

`POST_CHUNK` processing:
1. Validate `tx.to === derivedNq` (computed from `tx.from` + `post_id`).
2. Store chunk in `post_chunks`.
3. Call `tryAssemble()`.

Out-of-order handling (chunk arrives before POST_START): chunk is stored as an orphan. When POST_START arrives, `tryAssemble()` is called and completes immediately if all chunks are present.

### 3.6 Chunk Assembly

```javascript
async function tryAssemble(author, postId) {
  const post = await db.posts.get([author, postId])
  if (!post || post.total_chunks === null) return
  if (post.chunks_received < post.total_chunks) return

  const chunks  = await db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, postId, 0], [author, postId, 255])
    .sortBy('chunk_index')

  const encoded = concatChunkData(chunks)

  const digest  = await crypto.subtle.digest('SHA-256', encoded)
  const hash8   = new Uint8Array(digest).slice(0, 8)
  if (!bytesEqual(hash8, hexToBytes(post.content_hash))) {
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

  // Mark derived address sync as done
  const derivedNq = addressBytesToNq(
    await derivePostAddress(nqToAddressBytes(author), hexToBytes(postId))
  )
  await db.sync_state.update(`post:${derivedNq}`, { fully_synced: true })
}
```

### 3.7 Sync Strategy

```
On app mount:
  1. syncPostCatalog()     — delta sync (new events since newest_seen_tx_hash)
  2. syncFollowCatalog()   — delta sync

On tab focus (visibilitychange):
  1. syncPostCatalog()
  2. syncFollowCatalog()

Background (after catalog delta):
  - For each POST_START in catalog with status != 'complete':
    syncDerivedAddress(derivedNq) if not fully_synced

On scroll to end of feed:
  - Trigger next backfill page for post catalog
  - syncDerivedAddress for any pending posts in new page
```

Per-user address sync is **not needed** in this architecture. All post data flows through the post catalog (for metadata) and derived addresses (for chunks). All follow data flows through the follow catalog.

### 3.8 Sync Budget

- Max 2,000 transactions processed per sync tick before yielding to event loop (`setTimeout(0)`)
- Max 10 seconds wall-clock time per background sync session
- If budget exceeded mid-page: save cursor at current page boundary, resume next tick

### 3.9 Reorg Handling

Nimiq Albatross uses BFT consensus — practical finality is near-instant. For MVP:

- Posts are displayed as **tentative** (subtle UI indicator) until `current_tip - post.block_height >= 10`.
- On app load: re-fetch the most recent 50 blocks of the post catalog and any derived addresses of locally-authored posts. Compare tx_hash against stored records.
- If a stored tx_hash is no longer present: mark affected records `status: 'reorged'`, remove from feed silently.

---

## 4. Posting Flow

### 4.1 Onboarding — 1 Transaction

```
1. Hub login → receive address
2. Send PROFILE_CLAIM → POST_CATALOG_ADDRESS   (1 tx, 1 Luna)
```

One Hub signing popup. Username and display name are claimed in a single transaction.

### 4.2 Composing a Post — POST_INLINE

Used when post content fits in 51 bytes (no reply) or 23 bytes (reply).

```
1. User writes text (≤51 bytes UTF-8 enforced in UI)
2. Build POST_INLINE payload
3. Show: "This post is 1 transaction (1 Luna)"
4. User confirms
5. Hub.signTransaction → POST_CATALOG_ADDRESS
6. Broadcast
7. Optimistic local write: db.posts.put({ status: 'inline', content: text, ... })
```

### 4.3 Composing a Post — POST_START + Chunks

Used for longer posts.

```
1. User writes text (up to 280 chars)

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
   post_id_bytes = generatePostId()
   post_id_hex   = postIdToHex(post_id_bytes)

6. DERIVE POST ADDRESS
   authorBytes   = nqToAddressBytes(auth.address)
   derivedBytes  = await derivePostAddress(authorBytes, post_id_bytes)
   derivedNq     = addressBytesToNq(derivedBytes)

7. BUILD TRANSACTIONS
   tx[0]   = buildPostStart(post_id, total_chunks, flags, content_hash, reply?) → POST_CATALOG_ADDRESS
   tx[1..N] = chunks.map((c, i) => buildPostChunk(post_id, i, c) → derivedNq)

8. SHOW CONFIRMATION DIALOG
   "This post requires {N+1} transactions ({N+1} Luna)"
   User confirms

9. SIGN SEQUENTIALLY via Hub

10. OPTIMISTIC LOCAL WRITE
    db.posts.put({ author, post_id_hex, status: 'pending', content: text, ... })

11. BROADCAST SEQUENTIALLY (POST_START first, then chunks in order)

12. CONFIRMATION WATCH
    poll rpc.getTransactionByHash(post_start_tx.hash) every 5s
    on confirmed: post.status = 'pending' (chunks still needed)
    once all chunks confirmed and assembled: status = 'complete'
    on timeout (120s): show "Confirmation taking longer than expected" + retry
```

### 4.4 Edge Cases

| Situation | Behavior |
|---|---|
| Hub popup rejected mid-sequence | Signed txs already broadcast stay on chain as orphan chunks. POST_START not broadcast → post rolled back to `failed`. UI shows "Post failed — retry?" |
| RPC broadcast fails after signing | Signed txs held in memory. Retry button re-broadcasts without re-signing. |
| Tab closed during broadcast | Orphan chunks may land on chain. POST_START missing → chunks never assemble. User can re-post with new post_id. Old orphan chunks appear as `missing_chunks` and are hidden after 48 blocks. |
| Duplicate post_id (random collision) | Both POST_STARTs land in catalog. Lower `(block_height, tx_index)` is canonical; the other is discarded. |

---

## 5. Feed Construction

### 5.1 Global Feed

```
Source: catalog_refs WHERE type IN ('POST_INLINE', 'POST_START')
Sort:   (block_height DESC, tx_index DESC)
Page:   20 records at a time from IndexedDB

For each catalog_ref:
  post = db.posts.get([catalog_ref.sender, catalog_ref.post_id])
  'inline':        render PostCard (content immediate)
  'complete':      render PostCard
  'pending':       render PostSkeleton; trigger syncDerivedAddress if not started
  undefined:       render PostSkeleton; trigger syncDerivedAddress
  'invalid_hash':  skip
  'missing_chunks': render "Post unavailable"
```

### 5.2 Profile Feed

```
Source: catalog_refs WHERE type IN ('POST_INLINE', 'POST_START') AND sender = address
Sort:   (block_height DESC, tx_index DESC)
Page:   20 per page from IndexedDB
```

No per-user address sync needed — all posts are indexed from the catalog. Profile feed is built directly from `catalog_refs` filtered by `sender`.

### 5.3 Following Feed

```
1. followees = db.follows
     .where('follower').equals(currentUser)
     .filter(f => f.active)
     .toArray().map(f => f.followee)

2. pages = await Promise.all(
     followees.map(addr =>
       db.catalog_refs
         .where('[sender+type]')
         .between([addr, 'POST_INLINE'], [addr, 'POST_START\xff'])
         .toArray()
     )
   )
   merged = pages.flat().sort((a, b) =>
     b.block_height - a.block_height || b.tx_index - a.tx_index
   )

3. For each merged ref:
   post = db.posts.get([ref.sender, ref.post_id])
   ... same skeleton/complete logic as global feed
```

### 5.4 Partial Post Handling

| Status | UI |
|---|---|
| `pending` | Skeleton card with spinner |
| `missing_chunks` | "Post unavailable" with retry icon |
| `invalid_hash` | Hidden — no UI surface |
| Reply with missing parent | "Replying to @username" without parent embed |

### 5.5 Caching Strategy

IndexedDB is the primary cache. Pinia stores hold the active feed page slice (≤50 posts) as reactive state. On feed switch, the slice is cleared and reloaded from IndexedDB.

---

## 6. Spam & UX Strategy

### 6.1 Economics

Each NimFeed transaction costs 1 Luna. Negligible per post, but non-zero. Bulk spam (1,000 posts) costs 2,000–5,000 Luna depending on post length. This deters casual spam without preventing normal use.

### 6.2 Default UI Filters

Applied client-side. No protocol changes required.

| Filter | Default | Notes |
|---|---|---|
| Hide posts from addresses with no `PROFILE_CLAIM` | ON | Requires intentional onboarding |
| Hide posts from addresses < 10 blocks old | ON | Deters throwaway wallets |
| Minimum account balance 1,000 Luna | OFF | User-configurable |
| Show only followed accounts in global feed | OFF | Opt-in |

### 6.3 Username Spam

PROFILE_CLAIM costs 1 Luna. First-claim-wins creates a natural Schelling point. Squatting hundreds of usernames is linearly expensive.

### 6.4 Feed Poisoning

Spammers must send one catalog transaction per post. Bulk spam becomes visible as "N new posts from unknown accounts" and triggers the profile-claim filter.

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
| JavaScript | ES2022 | No TypeScript |

### 7.2 Folder Structure

```
src/
├── main.js
├── App.vue
│
├── protocol/
│   ├── constants.js        POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS, magic bytes, type codes
│   ├── encoder.js          buildProfileClaim, buildPostInline, buildPostStart, buildPostChunk, buildFollow, buildUnfollow
│   ├── decoder.js          parseTransaction → typed event object
│   ├── address.js          derivePostAddress, nqToAddressBytes, addressBytesToNq
│   └── compression.js      deflateRaw / inflateRaw wrappers (feature-detected)
│
├── chain/
│   ├── rpc.js              NimiqRPC class — getTransactionsByAddress, sendRawTransaction, normalizeTransaction
│   └── hub.js              useHub — signTransaction
│
├── db/
│   ├── schema.js           Dexie instance: profile_claims, users, posts, post_chunks, follows, catalog_refs, sync_state
│   └── queries.js          typed helpers
│
├── indexer/
│   ├── IndexerService.js   singleton — syncPostCatalog, syncFollowCatalog, syncDerivedAddress
│   ├── handlers.js         handleProfileClaim, handlePostInline, handlePostStart, handlePostChunk, handleFollow, handleUnfollow
│   ├── assembler.js        tryAssemble
│   └── useIndexer.js       Vue composable wrapping IndexerService
│
├── stores/
│   ├── auth.js             Hub login state, current user address + profile
│   ├── feed.js             active feed slice (global / profile / following)
│   └── ui.js               modal state, filter settings, composer state
│
├── composables/
│   ├── usePost.js          post creation: inline vs chunked, encode → sign → broadcast → watch
│   ├── useFeed.js          feed loading + pagination + reactive updates
│   ├── useProfile.js       profile resolution
│   └── useFollow.js        follow / unfollow actions + state
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

**`protocol/address.js`** — `derivePostAddress` is async (uses `crypto.subtle`). Must be imported as a regular ES module; not a composable.

**`chain/rpc.js`** — direct port of nimiq-doom's `NimiqRPC`. Add `sendRawTransaction(serializedHex)`. All responses pass through `normalizeTransaction()` before leaving the module.

**`chain/hub.js`** — port of nimiq-2048's `useHub`. Adds `signTransaction(txParams)`. Warmup iframe on app mount.

**`db/schema.js`** — single Dexie instance exported as singleton. No raw IndexedDB calls outside this module.

**`indexer/IndexerService.js`** — singleton, started once. Emits `'post:complete'`, `'post:inline'`, `'catalog:updated'`, `'follow:updated'` events. Composables subscribe to react to background sync completions.

**`stores/auth.js`** — holds `{ address, displayName, username, hasClaimed }` for the logged-in user. Persists address hint to `localStorage`.

---

## 8. Phased Implementation Plan

### Phase 1 — Core MVP

**Scope:**
- Hub login / logout
- Onboarding: PROFILE_CLAIM (1 tx)
- Post creation: POST_INLINE (1 tx) and POST_START + POST_CHUNK (N+1 txs)
- Global feed (post catalog scan)
- Profile view (post catalog filtered by sender)
- Indexer: post catalog sync + derived address sync per post
- All encoding/decoding for Phase 1 event types

**Deliverables:**
- Feed is readable without logging in
- Posting testable on Nimiq testnet with a dedicated test catalog address
- Indexer testable by replaying recorded RPC fixture responses
- Protocol encoder/decoder unit-testable in isolation

**Out of scope for Phase 1:** follows, replies in thread view (reply encoding is in protocol from Phase 1 but thread UI is deferred).

---

### Phase 2 — Social Graph

**Scope:**
- FOLLOW / UNFOLLOW sent to FOLLOW_CATALOG_ADDRESS
- Follow catalog sync (`syncFollowCatalog()`)
- Following feed (catalog_refs filtered by followee list)
- User search by username (from `profile_claims` store)
- Profile card shows follower / following counts
- `useFollow` composable

**Deliverables:**
- Follow graph works from local IndexedDB (follow catalog)
- Following feed built entirely from catalog data (no per-user sync)
- Username search works offline from locally indexed claims

---

### Phase 3 — Thread View

**Scope:**
- Reply composition: pre-fills `reply_to_*` fields in POST_START or POST_INLINE
- Thread / reply chain view
- `[reply_to_author, reply_to_post_id]` index used for thread assembly
- `PostThreadView` component

**Note:** Reply encoding is already in the protocol from Phase 1. Thread view is a UI concern only.

**Out of scope:** Likes are not part of V1.

---

## 9. Risks & Tradeoffs

| Risk | Impact | Mitigation |
|---|---|---|
| Post catalog grows with every post | Initial sync slow at scale | Linear growth manageable for years; sharded catalogs planned |
| Derived address has no private key — NIM is locked | Per-chunk NIM cost is permanent | Intentional design; 1 Luna per chunk is the spam prevention cost |
| Hub requires one popup per transaction | N+1 popups for long posts | Pre-post cost dialog; batch signing when Hub exposes it |
| RPC rate limits on public endpoints | Sync stalls | Exponential backoff; user-configurable RPC endpoint |
| `post_id` clock skew | Posts appear slightly out of order by timestamp | Canonical order is always `(block_height, tx_index)`, not post_id |
| Orphan chunks from failed posts | Clutter in derived address txs | No impact on other users; hidden after 48 blocks; no on-chain cleanup |
| Mobile browser memory constraints | Tab killed mid-sync | Feed slice capped at 50 posts; chunks deleted after assembly; sync state persisted |
| `CompressionStream` not available | Compression unavailable | Runtime feature detection; graceful fallback to raw bytes |

---

## 10. Future Evolution

**Optional backend indexer** — any indexer is a client that has pre-synced. The browser retains the canonical source and can verify indexer output.

**Sharded catalogs** — when catalog sync becomes slow, introduce a shard byte derived from `sender_address[0] & 0x0F` (16 shards). The protocol version byte is the migration lever.

**Likes** — add `LIKE_CATALOG_ADDRESS` receiving `LIKE` / `UNLIKE` events. Sender = liker, payload contains author + post_id. Global like counts become derivable from a single catalog scan. Out of scope for V1.

**Profile chunking** — `PROFILE_START` / `PROFILE_CHUNK` events for longer bios, avatar hashes, and website URLs. The `PROFILE_CLAIM` from Phase 1 remains valid.

**Richer media** — avatar URLs: new event type `AVATAR_SET` carrying a content-addressed URL hash. Full images: chunk protocol identical to NimFeed post chunks, at a new derived address type.

**Compression upgrade** — switch `deflate-raw` to Brotli when `CompressionStream('br')` has broad browser support. New flag value in POST_START flags byte.

**Verified usernames** — a trusted NimFeed registrar address co-signs PROFILE_CLAIM events. UI marks verified usernames with a badge.
