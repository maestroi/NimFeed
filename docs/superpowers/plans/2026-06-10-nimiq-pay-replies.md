# Nimiq Pay Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users connected via Nimiq Pay post replies, by adding a compact `POST_START` reply format (8-byte post-id reference instead of 28-byte author+post-id) that fits Nimiq Pay's 64-byte text-transaction limit, and removing the silent throw that currently blocks all Nimiq Pay replies.

**Architecture:** A new flag bit (`0x04`) on `POST_START` marks a "compact reply" whose payload is exactly 30 bytes (fits `"NFH:" + 60 hex chars` = 64 bytes). The compact format stores only `replyToPostId` (8 bytes); the indexer resolves the replying-to author locally via a new `post_id` index on the `posts` table, with a reconciliation pass for out-of-order sync. `usePost.js` always routes Nimiq Pay replies through the existing chunked-upload path (since the compact start packet has no room for inline text) and builds the compact `replyOpts` when `walletRuntime.isNimiqPay.value` is true.

**Tech Stack:** Vanilla JS (Vite + Vue 3), Dexie (IndexedDB), Vitest.

---

### Task 1: Encoder — compact reply `POST_START`

**Files:**
- Modify: `src/protocol/encoder.js:51-62`
- Test: `tests/protocol/encoder.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('buildPostStart', ...)` block in `tests/protocol/encoder.test.js`:

```js
  it('produces a 30-byte compact-reply payload referencing only replyToPostId', () => {
    const postId = new Uint8Array(8).fill(7)
    const hash = new Uint8Array(8).fill(0xff)
    const replyPostId = new Uint8Array(8).fill(0x42)
    const bytes = buildPostStart(postId, 1, false, hash, { replyPostId })

    expect(bytes[13] & 0x02).toBe(0x02) // isReply
    expect(bytes[13] & 0x04).toBe(0x04) // compact
    expect(bytes.slice(22, 30)).toEqual(replyPostId)
    // Compact reply payload is exactly 30 meaningful bytes (no author bytes written).
    expect(bytes.slice(30, 50)).toEqual(new Uint8Array(20))
  })

  it('produces the existing 50-byte full-reply payload when replyAuthor is provided', () => {
    const postId = new Uint8Array(8).fill(7)
    const hash = new Uint8Array(8).fill(0xff)
    const replyAuthor = new Uint8Array(20).fill(1)
    const replyPostId = new Uint8Array(8).fill(2)
    const bytes = buildPostStart(postId, 1, false, hash, { replyAuthor, replyPostId })

    expect(bytes[13] & 0x02).toBe(0x02) // isReply
    expect(bytes[13] & 0x04).toBe(0x00) // not compact
    expect(bytes.slice(22, 42)).toEqual(replyAuthor)
    expect(bytes.slice(42, 50)).toEqual(replyPostId)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/protocol/encoder.test.js`
Expected: the two new tests FAIL (compact flag `0x04` is never set; `bytes.slice(22,30)` doesn't equal `replyPostId` because current code writes `replyAuthor` there and throws on `reply.replyAuthor.slice` since `replyAuthor` is `undefined` for the compact case).

- [ ] **Step 3: Implement compact reply support in `buildPostStart`**

Replace `src/protocol/encoder.js:51-62`:

```js
export function buildPostStart(postIdBytes8, totalChunks, compressed, contentHash8, reply = null) {
  const buf = makePayload(TYPES.POST_START)
  buf.set(postIdBytes8, 4)
  buf[12] = totalChunks
  const isCompactReply = !!(reply && !reply.replyAuthor)
  buf[13] =
    (compressed ? 0x01 : 0x00) |
    (reply ? 0x02 : 0x00) |
    (isCompactReply ? 0x04 : 0x00)
  buf.set(contentHash8, 14)
  if (reply && isCompactReply) {
    buf.set(reply.replyPostId.slice(0, 8), 22)
  } else if (reply) {
    buf.set(reply.replyAuthor.slice(0, 20), 22)
    buf.set(reply.replyPostId.slice(0, 8), 42)
  }
  return buf
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/protocol/encoder.test.js`
Expected: PASS (all tests in the file, including the two new ones and the existing `buildPostStart` tests).

- [ ] **Step 5: Commit**

```bash
git add src/protocol/encoder.js tests/protocol/encoder.test.js
git commit -m "feat: encode compact reply POST_START for Nimiq Pay"
```

---

### Task 2: Decoder — compact reply `POST_START`

**Files:**
- Modify: `src/protocol/decoder.js:85-111`
- Test: `tests/protocol/decoder.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/protocol/decoder.test.js` (alongside the existing `'parses POST_START'` test, inside `describe('parseTransaction', ...)`):

```js
  it('parses a compact-reply POST_START', () => {
    const postId = new Uint8Array(8).fill(2)
    const hash = new Uint8Array(8).fill(0xab)
    const replyPostId = new Uint8Array(8).fill(0x42)
    const tx = mockTx(buildPostStart(postId, 1, false, hash, { replyPostId }))
    const ev = parseTransaction(tx)

    expect(ev.event).toBe('POST_START')
    expect(ev.isReply).toBe(true)
    expect(ev.isCompactReply).toBe(true)
    expect(ev.replyToAuthor).toBeNull()
    expect(ev.replyToPostId).toBe(postIdToHex(replyPostId))
  })

  it('parses a full-reply POST_START with isCompactReply false', () => {
    const postId = new Uint8Array(8).fill(2)
    const hash = new Uint8Array(8).fill(0xab)
    const replyAuthor = new Uint8Array(20).fill(1)
    const replyPostId = new Uint8Array(8).fill(2)
    const tx = mockTx(buildPostStart(postId, 1, false, hash, { replyAuthor, replyPostId }))
    const ev = parseTransaction(tx)

    expect(ev.isReply).toBe(true)
    expect(ev.isCompactReply).toBe(false)
    expect(ev.replyToAuthor).not.toBeNull()
    expect(ev.replyToPostId).toBe(postIdToHex(replyPostId))
  })
```

Add `postIdToHex` to the existing import from `'../../src/protocol/utils.js'` at the top of the file:

```js
import { bytesToHex, postIdToHex } from '../../src/protocol/utils.js'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/protocol/decoder.test.js`
Expected: the compact-reply test FAILS — `ev.isCompactReply` is `undefined`, and `ev.replyToAuthor` is non-null because the current decoder always treats `flags & 0x02` as the full-reply layout (it will misread bytes 22-42 as an address).

- [ ] **Step 3: Implement compact reply decoding in `decodePostStart`**

Replace `src/protocol/decoder.js:85-111`:

```js
function decodePostStart(base, bytes) {
  const postId = postIdToHex(bytes.slice(4, 12))
  const totalChunks = bytes[12]
  const flags = bytes[13]
  const compressed = !!(flags & 0x01)
  const isReply = !!(flags & 0x02)
  const isCompactReply = !!(flags & 0x04)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/protocol/decoder.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/protocol/decoder.js tests/protocol/decoder.test.js
git commit -m "feat: decode compact reply POST_START"
```

---

### Task 3: Mini app envelope — fit compact reply `POST_START` in 64 bytes

**Files:**
- Modify: `src/protocol/miniAppEnvelope.js:9-23`
- Test: `tests/protocol/miniAppEnvelope.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/protocol/miniAppEnvelope.test.js`. Update the import line to also bring in `buildPostStart`'s reply support (it's already imported) and `postIdToHex`:

```js
import { describe, expect, it } from 'vitest'
import { buildPostInline, buildPostStart, buildPostChunk } from '../../src/protocol/encoder.js'
import {
  decodeMiniAppEnvelopeHex,
  encodeMiniAppEnvelope,
  MINI_APP_CHUNK_DATA_SIZE,
} from '../../src/protocol/miniAppEnvelope.js'
import { bytesToHex } from '../../src/protocol/utils.js'
```

(no change needed to this import block — listed for context). Add a new test in the `describe('mini app transaction envelope', ...)` block:

```js
  it('fits a compact-reply POST_START in exactly 64 bytes', () => {
    const replyPostId = new Uint8Array(8).fill(9)
    const start = buildPostStart(
      new Uint8Array(8).fill(2),
      1,
      false,
      new Uint8Array(8).fill(3),
      { replyPostId },
    )

    const text = encodeMiniAppEnvelope(start)
    expect(text.length).toBe(64)

    const chainHex = bytesToHex(new TextEncoder().encode(text))
    const decodedHex = decodeMiniAppEnvelopeHex(chainHex)
    expect(decodedHex).toHaveLength(60) // 30 bytes
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/protocol/miniAppEnvelope.test.js`
Expected: FAIL — `semanticEnd` returns `50` for any `POST_START` with `flags & 0x02` set (current code doesn't check `0x04`), so trailing-zero trimming stops at 50 bytes instead of 30, producing `text.length === 104` (over 64) and `encodeMiniAppEnvelope` throws `'does not fit in a Nimiq Pay text transaction'`.

- [ ] **Step 3: Implement the compact-reply case in `semanticEnd`**

Replace `src/protocol/miniAppEnvelope.js:9-23`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/protocol/miniAppEnvelope.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/protocol/miniAppEnvelope.js tests/protocol/miniAppEnvelope.test.js
git commit -m "feat: fit compact reply POST_START in Nimiq Pay text transaction"
```

---

### Task 4: DB schema — `post_id` index on `posts`

**Files:**
- Modify: `src/db/schema.js`
- Test: `tests/db/schema.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/db/schema.test.js`, inside `describe('posts store', ...)`:

```js
  it('looks up a post by post_id alone via the post_id index', async () => {
    await putPost({
      author: 'NQ01 TARGET',
      post_id: '00000000000000aa',
      block_height: 50,
      tx_index: 0,
      content: 'original post',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'inline',
      first_seen_at: 50,
    })

    const found = await db.posts.where('post_id').equals('00000000000000aa').first()
    expect(found?.author).toBe('NQ01 TARGET')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/schema.test.js`
Expected: FAIL with a Dexie `SchemaError` (`KeyPath post_id on object store posts is not indexed`) — `post_id` is currently only part of the compound primary key `[author+post_id]`, not a standalone index.

- [ ] **Step 3: Add the `post_id` index in a new schema version**

Append to `src/db/schema.js` (after the existing `db.version(2)...` block):

```js
db.version(3).stores({
  profile_claims: '[username+address], username, address',
  users: 'address, username',
  posts: '[author+post_id], block_height, author, status, post_id, [reply_to_author+reply_to_post_id]',
  post_chunks: '[author+post_id+chunk_index]',
  catalog_refs: 'tx_hash, type, sender, [type+block_height+tx_index], [sender+type]',
  follows: '[follower+followee], follower, followee',
  sync_state: 'scope_key',
})
```

No `.upgrade()` callback is needed — Dexie builds the new `post_id` index from existing rows automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/schema.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.js tests/db/schema.test.js
git commit -m "feat: add post_id index for reply-author resolution"
```

---

### Task 5: Queries — `getPostByPostId` and `reconcileReplyAuthors`

**Files:**
- Modify: `src/db/queries.js`
- Test: `tests/db/schema.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/db/schema.test.js`. First update the import line at the top of the file to include the two new functions:

```js
import {
  putUser,
  getUser,
  putPost,
  getPost,
  getPostByPostId,
  reconcileReplyAuthors,
  putCatalogRef,
  getCatalogRefs,
  putProfileClaim,
  getMostActiveUsers,
} from '../../src/db/queries.js'
```

Add a new `describe` block at the end of the file:

```js
describe('reply author resolution', () => {
  it('getPostByPostId finds a post by its post_id alone', async () => {
    await putPost({
      author: 'NQ01 TARGET',
      post_id: '00000000000000bb',
      block_height: 50,
      tx_index: 0,
      content: 'original post',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'inline',
      first_seen_at: 50,
    })

    const found = await getPostByPostId('00000000000000bb')
    expect(found?.author).toBe('NQ01 TARGET')
  })

  it('getPostByPostId returns undefined when no post matches', async () => {
    const found = await getPostByPostId('ffffffffffffffff')
    expect(found).toBeUndefined()
  })

  it('reconcileReplyAuthors backfills reply_to_author once the target post is indexed', async () => {
    await putPost({
      author: 'NQ02 REPLIER',
      post_id: '00000000000000cc',
      block_height: 60,
      tx_index: 0,
      content: 'a reply',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: true,
      reply_to_author: null,
      reply_to_post_id: '00000000000000dd',
      status: 'inline',
      first_seen_at: 60,
    })

    // Target post arrives later (out-of-order sync).
    await putPost({
      author: 'NQ01 TARGET',
      post_id: '00000000000000dd',
      block_height: 55,
      tx_index: 0,
      content: 'original post',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'inline',
      first_seen_at: 55,
    })

    await reconcileReplyAuthors()

    const reply = await getPost('NQ02 REPLIER', '00000000000000cc')
    expect(reply.reply_to_author).toBe('NQ01 TARGET')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db/schema.test.js`
Expected: FAIL with `getPostByPostId is not a function` / `reconcileReplyAuthors is not a function` (import resolves to `undefined`).

- [ ] **Step 3: Implement `getPostByPostId` and `reconcileReplyAuthors`**

Add to `src/db/queries.js`, immediately after `export const getPost = (author, postId) => db.posts.get([author, postId])` (around line 104):

```js
export const getPostByPostId = (postId) => db.posts.where('post_id').equals(postId).first()

export async function reconcileReplyAuthors() {
  const unresolved = await db.posts
    .toCollection()
    .filter((p) => p.is_reply && !p.reply_to_author && !!p.reply_to_post_id)
    .toArray()

  for (const post of unresolved) {
    const target = await getPostByPostId(post.reply_to_post_id)
    if (target?.author) {
      await db.posts.update([post.author, post.post_id], { reply_to_author: target.author })
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db/schema.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/db/queries.js tests/db/schema.test.js
git commit -m "feat: add post_id lookup and reply-author reconciliation"
```

---

### Task 6: Indexer — resolve `reply_to_author` for compact replies

**Files:**
- Modify: `src/indexer/handlers.js`
- Test: `tests/indexer/handlers.test.js`

- [ ] **Step 1: Write the failing tests**

Update the import block at the top of `tests/indexer/handlers.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processPostCatalogTx } from '../../src/indexer/handlers.js'
import { putPost } from '../../src/db/queries.js'
import { buildProfileClaim, buildPostInline, buildPostStart } from '../../src/protocol/encoder.js'
import { bytesToHex, generatePostId, postIdToHex, hexToPostIdBytes } from '../../src/protocol/utils.js'
import { POST_CATALOG_ADDRESS } from '../../src/protocol/constants.js'
```

Add two new tests to the `describe('processPostCatalogTx', ...)` block:

```js
  it('resolves reply_to_author for a compact-reply POST_START when the target is already indexed', async () => {
    const targetId = generatePostId()
    const targetIdHex = postIdToHex(targetId)
    await putPost({
      author: 'NQ01 TARGET',
      post_id: targetIdHex,
      block_height: 50,
      tx_index: 0,
      content: 'original post',
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'inline',
      first_seen_at: 50,
    })

    const replyId = generatePostId()
    const hash8 = new Uint8Array(8).fill(1)
    const payload = buildPostStart(replyId, 1, false, hash8, { replyPostId: hexToPostIdBytes(targetIdHex) })
    await processPostCatalogTx(tx(payload, 'NQ02 REPLIER', POST_CATALOG_ADDRESS, 60, 0))

    const reply = await db.posts.get(['NQ02 REPLIER', postIdToHex(replyId)])
    expect(reply.is_reply).toBe(true)
    expect(reply.reply_to_author).toBe('NQ01 TARGET')
    expect(reply.reply_to_post_id).toBe(targetIdHex)
  })

  it('leaves reply_to_author null for a compact-reply POST_START when the target is not yet indexed', async () => {
    const targetIdHex = postIdToHex(generatePostId())
    const replyId = generatePostId()
    const hash8 = new Uint8Array(8).fill(1)
    const payload = buildPostStart(replyId, 1, false, hash8, { replyPostId: hexToPostIdBytes(targetIdHex) })
    await processPostCatalogTx(tx(payload, 'NQ02 REPLIER', POST_CATALOG_ADDRESS, 60, 0))

    const reply = await db.posts.get(['NQ02 REPLIER', postIdToHex(replyId)])
    expect(reply.is_reply).toBe(true)
    expect(reply.reply_to_author).toBeNull()
    expect(reply.reply_to_post_id).toBe(targetIdHex)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/indexer/handlers.test.js`
Expected: FAIL — `reply.reply_to_author` is `null` in the first test (no resolution happens yet) and `reply.is_reply`/`reply.reply_to_post_id` come through correctly already (decoder change from Task 2 already populates these), but the author isn't resolved.

- [ ] **Step 3: Resolve `reply_to_author` for compact replies in `handlePostStart`**

In `src/indexer/handlers.js`, add `getPostByPostId` to the existing import from `'../db/queries.js'`:

```js
import {
  putProfileClaim,
  getWinningClaim,
  getLatestClaimByAddress,
  putUser,
  getUser,
  updateUser,
  getUsersByUsername,
  getPost,
  getPostByPostId,
  putPost,
  updatePost,
  putChunk,
  putCatalogRef,
  getFollow,
  putFollow,
} from '../db/queries.js'
```

Replace `handlePostStart` (`src/indexer/handlers.js:156-192`):

```js
async function handlePostStart(ev) {
  const existing = await getPost(ev.from, ev.postId)

  let replyToAuthor = ev.replyToAuthor
  if (ev.isReply && ev.isCompactReply) {
    const target = await getPostByPostId(ev.replyToPostId)
    replyToAuthor = target?.author ?? null
  }

  const record = {
    author: ev.from,
    post_id: ev.postId,
    tx_hash: ev.txHash,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    content: null,
    total_chunks: ev.totalChunks,
    chunks_received: existing?.chunks_received ?? 0,
    compressed: ev.compressed,
    content_hash: ev.contentHash,
    is_inline: false,
    is_reply: ev.isReply,
    reply_to_author: replyToAuthor,
    reply_to_post_id: ev.replyToPostId,
    status: 'pending',
    first_seen_at: existing?.first_seen_at ?? ev.blockHeight,
  }

  await putPost(record)

  await putCatalogRef({
    tx_hash: ev.txHash,
    type: 'POST_START',
    sender: ev.from,
    post_id: ev.postId,
    username: null,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    seen_at: Date.now(),
  })

  await tryAssemble(ev.from, ev.postId)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/indexer/handlers.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/indexer/handlers.js tests/indexer/handlers.test.js
git commit -m "feat: resolve reply author for compact-reply posts during indexing"
```

---

### Task 7: Wire `reconcileReplyAuthors` into delta sync

**Files:**
- Modify: `src/indexer/IndexerService.js:9,113`

- [ ] **Step 1: Add the import**

In `src/indexer/IndexerService.js:9`, change:

```js
import { getSyncState, putSyncState, reconcileUsernameOwnership } from '../db/queries.js'
```

to:

```js
import { getSyncState, putSyncState, reconcileUsernameOwnership, reconcileReplyAuthors } from '../db/queries.js'
```

- [ ] **Step 2: Call it after `reconcileUsernameOwnership()`**

In `src/indexer/IndexerService.js:113`, change:

```js
      await this.syncPostCatalog()
      await reconcileUsernameOwnership()
      await this.syncFollowCatalog()
```

to:

```js
      await this.syncPostCatalog()
      await reconcileUsernameOwnership()
      await reconcileReplyAuthors()
      await this.syncFollowCatalog()
```

- [ ] **Step 3: Run the full indexer test suite to verify nothing broke**

Run: `npx vitest run tests/indexer/`
Expected: PASS (all existing indexer tests, including `tests/indexer/IndexerService.derived.test.js`).

- [ ] **Step 4: Commit**

```bash
git add src/indexer/IndexerService.js
git commit -m "feat: reconcile reply authors during delta sync"
```

---

### Task 8: `usePost.js` — enable Nimiq Pay replies via compact chunked POST_START

**Files:**
- Modify: `src/composables/usePost.js:128-178,272-273`
- Test: `tests/composables/usePost.chunked.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/composables/usePost.chunked.test.js`. Update the import line at the top of the file to add `TYPES` and `postIdToHex`:

```js
import { usePost } from '../../src/composables/usePost.js'
import { TYPES } from '../../src/protocol/constants.js'
import { postIdToHex } from '../../src/protocol/utils.js'
```

Add a new test inside `describe('usePost chunked popup recovery', ...)`, after the `'uses smaller chunks for Nimiq Pay text transactions'` test:

```js
  it('sends a compact-reply POST_START for Nimiq Pay replies', async () => {
    mocks.isNimiqPay.value = true
    const { submitPost } = usePost()
    const replyToPostId = '00000000000000ff'

    await expect(
      submitPost('hi', {
        replyToAuthor: 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD',
        replyToPostId,
      }),
    ).resolves.toBeUndefined()

    expect(mocks.sendMiniAppTransaction.mock.calls.length).toBeGreaterThanOrEqual(2)

    const startPayload = mocks.sendMiniAppTransaction.mock.calls[0][0].extraData
    expect(startPayload[3]).toBe(TYPES.POST_START)
    expect(startPayload[13] & 0x02).toBe(0x02) // isReply
    expect(startPayload[13] & 0x04).toBe(0x04) // compact
    expect(postIdToHex(startPayload.slice(22, 30))).toBe(replyToPostId)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/composables/usePost.chunked.test.js`
Expected: FAIL — `submitPost` rejects with `'Replies are not supported in Nimiq Pay yet.'` (the early throw at `src/composables/usePost.js:130-132`).

- [ ] **Step 3: Remove the early throw and adjust the inline-size limit**

In `src/composables/usePost.js`, replace the start of `submitPost` (lines 128-141):

```js
  async function submitPost(text, { replyToAuthor = null, replyToPostId = null } = {}) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    if (walletRuntime.isNimiqPay.value && replyToAuthor && replyToPostId) {
      throw new Error('Replies are not supported in Nimiq Pay yet.')
    }
    if (!text?.trim()) throw new Error('Post text is empty')
    if (text.length > MAX_POST_CHARS) throw new Error(`Post exceeds ${MAX_POST_CHARS} chars`)
    if (sending.value) return
    sending.value = true
    error.value = null
    signingActive.value = false
    signingStep.value = 0
    signingTotal.value = 0
    signingLabel.value = ''
```

with:

```js
  async function submitPost(text, { replyToAuthor = null, replyToPostId = null } = {}) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    if (!text?.trim()) throw new Error('Post text is empty')
    if (text.length > MAX_POST_CHARS) throw new Error(`Post exceeds ${MAX_POST_CHARS} chars`)
    if (sending.value) return
    sending.value = true
    error.value = null
    signingActive.value = false
    signingStep.value = 0
    signingTotal.value = 0
    signingLabel.value = ''
```

Then, inside the `try` block (lines 144-150), replace the `limit` calculation:

```js
      const raw = new TextEncoder().encode(text)
      const isReply = !!(replyToAuthor && replyToPostId)
      const limit = walletRuntime.isNimiqPay.value
        ? MINI_APP_INLINE_DATA_SIZE
        : isReply
          ? INLINE_MAX_WITH_REPLY
          : INLINE_MAX_NO_REPLY
```

with:

```js
      const raw = new TextEncoder().encode(text)
      const isReply = !!(replyToAuthor && replyToPostId)
      const limit = walletRuntime.isNimiqPay.value
        ? isReply
          ? 0
          : MINI_APP_INLINE_DATA_SIZE
        : isReply
          ? INLINE_MAX_WITH_REPLY
          : INLINE_MAX_NO_REPLY
```

- [ ] **Step 4: Build the compact `replyOpts` for Nimiq Pay in `_submitChunked`**

In `src/composables/usePost.js`, replace lines 240-245 (the `replyOpts` construction inside `_submitChunked`):

```js
      const replyOpts = isReply
        ? {
            replyAuthor: nqToAddressBytes(replyToAuthor),
            replyPostId: hexToPostIdBytes(replyToPostId),
          }
        : null
```

with:

```js
      const replyOpts = isReply
        ? walletRuntime.isNimiqPay.value
          ? { replyPostId: hexToPostIdBytes(replyToPostId) }
          : {
              replyAuthor: nqToAddressBytes(replyToAuthor),
              replyPostId: hexToPostIdBytes(replyToPostId),
            }
        : null
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/composables/usePost.chunked.test.js`
Expected: PASS (all tests in the file, including the new compact-reply test and the existing popup-recovery, Nimiq Pay, and unfinished-chunk tests).

- [ ] **Step 6: Commit**

```bash
git add src/composables/usePost.js tests/composables/usePost.chunked.test.js
git commit -m "feat: enable Nimiq Pay replies via compact chunked POST_START"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full Vitest suite**

Run: `npx vitest run`
Expected: PASS — same pass/fail counts as the pre-existing baseline (114 passing / 3 pre-existing failures unrelated to this change), plus the new tests added in Tasks 1-8 all passing.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Manual verification on the Nimiq Pay emulator**

Using the existing adb/uiautomator workflow:
1. Open a post's "Reply" button, type a short reply (e.g. "test reply works now"), tap "Post".
2. Confirm the composer shows "Signing 1/2: POST_START" then "Signing 2/2: POST_CHUNK 1/1" (per `PostComposer.vue`'s `signingActive`/`signingLabel` UI), with a Nimiq Pay approval prompt for each.
3. After both approvals, confirm the composer closes and the reply appears under the original post with "Replying to @<author>".

- [ ] **Step 4: Commit (if any fixups were needed)**

Only commit if Steps 1-3 required code changes; otherwise this task produces no commit.

---

## Self-Review Notes

- **Spec coverage:** Task 1 = encoder section; Task 2 = decoder section; Task 3 = envelope `semanticEnd` section; Task 4 = DB schema section; Task 5 = query/reconciliation section; Task 6 = indexer `handlePostStart` section; Task 7 = `IndexerService` wiring; Task 8 = `usePost.js` section (throw removal, limit, `replyOpts`); Task 9 = testing section. All spec sections are covered.
- **Type/name consistency:** `getPostByPostId`, `reconcileReplyAuthors`, `isCompactReply`, `replyPostId` (compact `reply` shape with no `replyAuthor` key) are used consistently across Tasks 1, 2, 5, 6, 8.
- **No placeholders:** every step shows the full code to write or the exact diff context.
