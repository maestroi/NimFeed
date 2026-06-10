# Nimiq Pay Replies Design

**Date:** 2026-06-10
**Status:** Approved

## Goal

Allow users connected via Nimiq Pay to post replies, matching the
existing reply experience available to Hub-connected browser users.

## Background / Constraint

Nimiq Pay's `sendBasicTransactionWithData()` only accepts text data, so
NimFeed encodes its binary protocol payload as `"NFH:" + hex(payload)`
(see `src/protocol/miniAppEnvelope.js`). The mini app host caps this text
at `MAX_TEXT_BYTES = 64` bytes, i.e. **30 raw payload bytes** after the
4-byte `"NFH:"` prefix.

The existing reply format (`buildPostInline` / `buildPostStart` with
`reply.replyAuthor` + `reply.replyPostId`) needs 28 bytes for the reply
reference (20-byte address + 8-byte post id) on top of the 13-byte
header/postId/flags — already over the 30-byte budget before any post
text. This is why `usePost.js` currently throws
`'Replies are not supported in Nimiq Pay yet.'` whenever
`walletRuntime.isNimiqPay` is true and a reply is attempted — and that
throw happens before `error.value` is set, so the failure is silent.

## Approach

Add a **compact reply** variant of `POST_START`, used only when posting
a reply via Nimiq Pay. It references the target post by `post_id` alone
(8 bytes) instead of `author + post_id` (28 bytes). The author is
resolved locally from the existing post index (post ids are an 8-byte
timestamp+random value, unique enough in practice for this purpose).

Compact reply `POST_START` layout (30 raw bytes → exactly 64 bytes as
`"NFH:" + hex`):

| Bytes | Field |
|-------|-------|
| 0–2   | MAGIC |
| 2     | VERSION |
| 3     | TYPE = `POST_START` |
| 4–12  | own `post_id` (8 bytes) |
| 12    | `totalChunks` |
| 13    | flags: `0x01` compressed, `0x02` isReply, `0x04` compactReply |
| 14–22 | `contentHash` (8 bytes) — unchanged, full integrity check kept |
| 22–30 | `replyToPostId` (8 bytes) — compact reference |

This is exactly the existing 30-byte budget, so the full 8-byte content
hash is preserved (no integrity tradeoff vs. normal chunked posts).

Because the compact start packet has no room for text, **Nimiq Pay
replies always go through the chunked posting path**, even for short
text. This reuses the existing chunked-upload machinery
(`MINI_APP_CHUNK_DATA_SIZE = 16`), so reply text supports the full
`MAX_POST_CHARS` (280), not just a few characters.

**Tradeoff:** a Nimiq Pay reply always requires ≥2 on-chain transactions
(compact `POST_START` + ≥1 `POST_CHUNK`), i.e. ≥2 Nimiq Pay approval
prompts, even for a one-word reply. The composer already communicates
"Nimiq Pay will ask you to approve each on-chain post transaction" and
shows signing-step progress for chunked uploads, so this fits existing
UX.

Hub/browser replies are unaffected — they keep using the existing full
`replyAuthor + replyToPostId` format (`INLINE_MAX_WITH_REPLY = 23`,
`CHUNK_DATA_SIZE = 50`).

## Encoder Changes (`src/protocol/encoder.js`)

`buildPostStart(postIdBytes8, totalChunks, compressed, contentHash8, reply)`:

- `reply = { replyAuthor, replyPostId }` → existing full format (flags
  `0x02`, 50-byte payload). Unchanged.
- `reply = { replyPostId }` (no `replyAuthor`) → new compact format
  (flags `0x02 | 0x04`, 30-byte payload): write `replyPostId` at offset
  22.
- `reply = null` → existing non-reply format (flags `0x00`, 22-byte
  payload). Unchanged.

`buildPostInline` is unchanged — compact replies never use the inline
format.

## Decoder Changes (`src/protocol/decoder.js`)

`decodePostStart`:

- flags `& 0x04` → `isReply = true`, `isCompactReply = true`,
  `replyToAuthor = null`, `replyToPostId = postIdToHex(bytes.slice(22, 30))`.
- else flags `& 0x02` → existing full-format decoding (unchanged).
- else → `isReply = false` (unchanged).

Returned event gains an `isCompactReply` boolean (false for all other
event types / formats).

## Envelope Changes (`src/protocol/miniAppEnvelope.js`)

`semanticEnd` for `POST_START`:

```js
case TYPES.POST_START:
  if (payload[13] & 0x04) return 30   // compact reply
  return payload[13] & 0x02 ? 50 : 22 // full reply / no reply
```

## Database Changes (`src/db/schema.js`)

Add a non-unique `post_id` index to the `posts` table so the indexer can
resolve a reply target's author from `replyToPostId` alone:

```js
db.version(3).stores({
  // ...unchanged tables...
  posts: '[author+post_id], block_height, author, status, post_id, [reply_to_author+reply_to_post_id]',
  // ...
})
```

No data migration needed — Dexie builds the new index from existing
rows automatically.

## Query Changes (`src/db/queries.js`)

Add `getPostByPostId(postId)`:

```js
export async function getPostByPostId(postId) {
  return db.posts.where('post_id').equals(postId).first()
}
```

Add `reconcileReplyAuthors()`, modeled on
`reconcileUsernameOwnership()`, to backfill `reply_to_author` for
compact replies whose target post wasn't yet synced when the reply was
first processed:

```js
export async function reconcileReplyAuthors() {
  const unresolved = await db.posts
    .filter((p) => p.is_reply && !p.reply_to_author && p.reply_to_post_id)
    .toArray()
  for (const post of unresolved) {
    const target = await getPostByPostId(post.reply_to_post_id)
    if (target?.author) {
      await db.posts.update([post.author, post.post_id], { reply_to_author: target.author })
    }
  }
}
```

## Indexer Changes (`src/indexer/handlers.js`, `src/indexer/IndexerService.js`)

`handlePostStart`:

```js
let replyToAuthor = ev.replyToAuthor
if (ev.isReply && ev.isCompactReply) {
  const target = await getPostByPostId(ev.replyToPostId)
  replyToAuthor = target?.author ?? null
}
// ...store replyToAuthor as reply_to_author as before
```

`IndexerService._runDeltaSync`: call `reconcileReplyAuthors()` alongside
the existing `reconcileUsernameOwnership()` call.

## `usePost.js` Changes

- Remove the early `'Replies are not supported in Nimiq Pay yet.'` throw
  (lines 130–132).
- In `submitPost`, the inline-vs-chunked size threshold becomes:
  ```js
  const limit = walletRuntime.isNimiqPay.value
    ? (isReply ? 0 : MINI_APP_INLINE_DATA_SIZE)
    : (isReply ? INLINE_MAX_WITH_REPLY : INLINE_MAX_NO_REPLY)
  ```
  A `limit` of `0` forces any non-empty reply text into
  `_submitChunked` when using Nimiq Pay.
- In `_submitChunked`, build `replyOpts` as compact
  (`{ replyPostId }`, no `replyAuthor`) when `walletRuntime.isNimiqPay.value`
  is true; otherwise keep the existing full `{ replyAuthor, replyPostId }`.

## UI Changes

None required beyond the removal of the silent-throw guard —
`PostComposer.vue`'s existing `signingActive` / `signingStep` /
`signingTotal` / "Nimiq Pay will ask you to approve each on-chain post
transaction" UI already covers the chunked-reply flow.

## Error Handling

- If `submitPost` throws for any other reason (e.g. popup blocked,
  unfinished chunked session), existing error handling is unchanged.
- If `getPostByPostId` finds no match for a compact reply's
  `replyToPostId` at decode time, `reply_to_author` is stored as `null`
  and backfilled later by `reconcileReplyAuthors()` once/if the target
  post is synced. If the target is never found (e.g. it was pruned or
  never indexed), the post remains a reply with `reply_to_author: null`;
  `PostCard.vue`'s "Replying to" line falls back to showing
  `reply_to_post_id`-derived text only if `reply_to_author` is present —
  this is an existing acceptable degradation, not a regression.

## Testing

- `tests/protocol/encoder.test.js`: `buildPostStart` produces the
  30-byte compact-reply layout when `reply = { replyPostId }` (no
  `replyAuthor`), and the existing 50-byte/22-byte layouts are
  unchanged.
- `tests/protocol/decoder.test.js`: `decodePostStart` correctly decodes
  compact-reply payloads (`isCompactReply: true`, `replyToAuthor: null`,
  `replyToPostId` populated) and existing full/no-reply payloads
  unchanged.
- `tests/protocol/miniAppEnvelope.test.js`: `encodeMiniAppEnvelope`
  produces exactly 64 bytes (`"NFH:" + 60 hex chars`) for a compact
  reply `POST_START`, and does not throw.
- `tests/db/schema.test.js`: new `post_id` index on `posts` is queryable.
- `tests/indexer/handlers.test.js`: `handlePostStart` resolves
  `reply_to_author` via `getPostByPostId` for compact replies, both when
  the target exists and when it doesn't (left `null`).
- New test for `reconcileReplyAuthors()`: backfills `reply_to_author`
  once the target post becomes available.
- `tests/composables/usePost.chunked.test.js`: a Nimiq Pay reply of any
  length (including very short text) goes through `_submitChunked` with
  a compact `replyOpts`, and no longer throws
  `'Replies are not supported in Nimiq Pay yet.'`.

The full Vitest suite and production build must pass.
