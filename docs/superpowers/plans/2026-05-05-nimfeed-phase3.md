# NimFeed Phase 3 — Reactions & Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add likes, reply composition, and threaded post views — completing the core social feature set of NimFeed MVP.

**Architecture:** LIKE/UNLIKE are self-transactions pointing at `(post_author, post_id)` pairs, already defined in the Phase 1 protocol. Reply posts are standard POST_START/CHUNK/ANNOUNCE transactions with the `is_reply` flag set and `reply_to_author`/`reply_to_post_id` filled. Thread view is assembled entirely from IndexedDB using the `[reply_to_author+reply_to_post_id]` compound index. No new event types needed.

**Tech Stack:** Same as Phase 1/2.

**Spec:** `docs/superpowers/specs/2026-05-05-nimfeed-design.md` §§ Phase 3, LIKE/UNLIKE payload layout, §2.3 posts store reply indexes.

**Prerequisite:** Phase 2 plan complete and all tests passing.

---

## File Map

```
Modify:
  src/protocol/decoder.js          fix decodeLikeUnlike to return NQ address for postAuthor
  src/indexer/handlers.js          add handleLike + handleUnlike
  src/db/queries.js                add like queries and reply queries
  src/composables/usePost.js       add reply support (replyToAuthor, replyToPostId params)
  src/components/feed/PostCard.vue add like button + count, reply button
  src/components/profile/ProfileView.vue  add reply thread link

Create:
  src/composables/useLike.js
  src/components/post/PostDetail.vue      thread view
  tests/indexer/like.handlers.test.js
  tests/protocol/decoder.like.test.js
```

---

## Task 1: Fix Decoder — LIKE/UNLIKE postAuthor Address Format

The Phase 1 decoder returns `postAuthor` from LIKE/UNLIKE as raw hex bytes. The `likes` store uses NQ-format strings. Fix to be consistent with the FOLLOW fix in Phase 2.

**Files:**
- Modify: `src/protocol/decoder.js`
- Modify: `tests/protocol/decoder.test.js`

- [ ] **Step 1: Add failing test**

Add to `tests/protocol/decoder.test.js`:

```javascript
import { buildLike, buildUnlike } from '../../src/protocol/encoder.js'

describe('LIKE / UNLIKE address format', () => {
  it('returns postAuthor as NQ string for LIKE', () => {
    const authorBytes = new Uint8Array(20).fill(3)
    const tx = mockTx(buildLike({ postIdBuf: generatePostId(), postAuthorBytes: authorBytes }))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('LIKE')
    expect(ev.postAuthor).toMatch(/^NQ/)
  })

  it('returns UNLIKE event for unlike payload', () => {
    const authorBytes = new Uint8Array(20).fill(4)
    const tx = mockTx(buildUnlike({ postIdBuf: generatePostId(), postAuthorBytes: authorBytes }))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('UNLIKE')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm test tests/protocol/decoder.test.js
```

Expected: FAIL — `postAuthor` is hex.

- [ ] **Step 3: Fix decodeLikeUnlike in src/protocol/decoder.js**

Replace the existing `decodeLikeUnlike` function:

```javascript
// OLD:
// function decodeLikeUnlike(base, bytes, event) {
//   const postId     = postIdToHex(bytes.slice(4, 12).buffer)
//   const postAuthor = bytesToHex(bytes.slice(12, 32))
//   return { ...base, event, postId, postAuthor }
// }

// NEW:
function decodeLikeUnlike(base, bytes, event) {
  const postId     = postIdToHex(bytes.slice(4, 12).buffer)
  const postAuthor = addressBytesToNq(bytes.slice(12, 32))
  return { ...base, event, postId, postAuthor }
}
```

`addressBytesToNq` is already imported from Phase 2 changes.

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test tests/protocol/decoder.test.js
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/decoder.js tests/protocol/decoder.test.js
git commit -m "fix: decoder returns NQ address for LIKE/UNLIKE postAuthor"
```

---

## Task 2: Like Queries

**Files:**
- Modify: `src/db/queries.js`

- [ ] **Step 1: Add like and reply queries to src/db/queries.js**

Append to the existing `queries.js`:

```javascript
// Likes
export const putLike = (like) => db.likes.put(like)

export const getLike = (liker, post_author, post_id) =>
  db.likes.get([liker, post_author, post_id])

export async function getLikeCount(post_author, post_id) {
  return db.likes.where('[post_author+post_id]')
    .equals([post_author, post_id])
    .filter(r => r.active)
    .count()
}

export async function isLiked(liker, post_author, post_id) {
  const row = await db.likes.get([liker, post_author, post_id])
  return !!row?.active
}

// Replies — get all direct replies to a post
export async function getReplies(post_author, post_id) {
  const rows = await db.posts
    .where('[reply_to_author+reply_to_post_id]')
    .equals([post_author, post_id])
    .toArray()
  return rows
    .filter(p => p.status === 'complete')
    .sort((a, b) => a.block_height - b.block_height || a.tx_index - b.tx_index)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/queries.js
git commit -m "feat: like queries (put, count, isLiked) and reply queries"
```

---

## Task 3: Like/Unlike Handlers

**Files:**
- Modify: `src/indexer/handlers.js`
- Create: `tests/indexer/like.handlers.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/indexer/like.handlers.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processTransaction } from '../../src/indexer/handlers.js'
import { buildLike, buildUnlike } from '../../src/protocol/encoder.js'
import { bytesToHex, generatePostId, postIdToHex, nqToAddressBytes } from '../../src/protocol/utils.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const LIKER       = 'NQ01 LIKER000000000000000000000000'
const AUTHOR_NQ   = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0002'
const authorBytes = nqToAddressBytes(AUTHOR_NQ)
const postIdBuf   = generatePostId()
const POST_ID_HEX = postIdToHex(postIdBuf)

function selfTx(payload, from, blockHeight = 100, txIndex = 0) {
  return { hash: Math.random().toString(36), from, to: from, data: bytesToHex(payload), blockHeight, transactionIndex: txIndex, timestamp: 0 }
}

describe('LIKE handler', () => {
  it('stores an active like record', async () => {
    await processTransaction(selfTx(buildLike({ postIdBuf, postAuthorBytes: authorBytes }), LIKER))
    const row = await db.likes.get([LIKER, AUTHOR_NQ, POST_ID_HEX])
    expect(row).toBeTruthy()
    expect(row.active).toBe(true)
  })

  it('rejects like that is not a self-tx', async () => {
    const tx = { hash: 'x', from: LIKER, to: 'NQ99 OTHER', data: bytesToHex(buildLike({ postIdBuf, postAuthorBytes: authorBytes })), blockHeight: 100, transactionIndex: 0 }
    await processTransaction(tx)
    const row = await db.likes.get([LIKER, AUTHOR_NQ, POST_ID_HEX])
    expect(row).toBeUndefined()
  })
})

describe('UNLIKE handler', () => {
  it('sets active=false on an existing like', async () => {
    await processTransaction(selfTx(buildLike({ postIdBuf, postAuthorBytes: authorBytes }), LIKER, 100))
    await processTransaction(selfTx(buildUnlike({ postIdBuf, postAuthorBytes: authorBytes }), LIKER, 101))
    const row = await db.likes.get([LIKER, AUTHOR_NQ, POST_ID_HEX])
    expect(row.active).toBe(false)
  })

  it('does not overwrite a newer LIKE with an older UNLIKE', async () => {
    await processTransaction(selfTx(buildLike({ postIdBuf, postAuthorBytes: authorBytes }), LIKER, 200))
    await processTransaction(selfTx(buildUnlike({ postIdBuf, postAuthorBytes: authorBytes }), LIKER, 100))
    const row = await db.likes.get([LIKER, AUTHOR_NQ, POST_ID_HEX])
    expect(row.active).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/indexer/like.handlers.test.js
```

Expected: FAIL.

- [ ] **Step 3: Add LIKE/UNLIKE handlers to src/indexer/handlers.js**

In the `processTransaction` switch, replace the `// FOLLOW, UNFOLLOW, LIKE, UNLIKE handled in Phase 2 and 3` comment (which should now read `// LIKE, UNLIKE handled in Phase 3`) with:

```javascript
case TYPES.LIKE:
  if (!isValidSelfTx(tx)) return
  return handleLikeUnlike(event, tx)
case TYPES.UNLIKE:
  if (!isValidSelfTx(tx)) return
  return handleLikeUnlike(event, tx)
```

Add the handler function at the bottom of `handlers.js`:

```javascript
async function handleLikeUnlike(event, tx) {
  const existing = await getLike(event.from, event.postAuthor, event.postId)
  const active   = event.event === 'LIKE'

  if (existing) {
    const isNewer =
      event.blockHeight > existing.block_height ||
      (event.blockHeight === existing.block_height && event.txIndex > existing.tx_index)
    if (!isNewer) return
  }

  await putLike({
    liker:        event.from,
    post_author:  event.postAuthor,
    post_id:      event.postId,
    active,
    block_height: event.blockHeight,
    tx_index:     event.txIndex,
  })
}
```

Add `getLike` and `putLike` to the existing import at the top of `handlers.js`:

```javascript
import {
  putUser, getUser, updateUser,
  putPost, getPost, updatePost,
  putChunk,
  putCatalogRef,
  putUsernameClaim,
  putFollow, getFollow,
  putLike, getLike,
} from '../db/queries.js'
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/indexer/like.handlers.test.js
```

Expected: All pass.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/indexer/handlers.js tests/indexer/like.handlers.test.js
git commit -m "feat: LIKE/UNLIKE handlers with latest-wins conflict resolution"
```

---

## Task 4: useLike Composable

**Files:**
- Create: `src/composables/useLike.js`

- [ ] **Step 1: Create src/composables/useLike.js**

```javascript
import { ref, watch, onMounted } from 'vue'
import { useHub } from '../chain/hub.js'
import { rpc } from '../chain/rpc.js'
import { buildLike, buildUnlike } from '../protocol/encoder.js'
import { nqToAddressBytes, postIdToHex } from '../protocol/utils.js'
import { TX_VALUE_LUNA } from '../protocol/constants.js'
import { isLiked as dbIsLiked, getLikeCount } from '../db/queries.js'
import { useAuthStore } from '../stores/auth.js'

// postAuthor: NQ string, postId: 16-char hex
export function useLike(postAuthor, postId) {
  const auth    = useAuthStore()
  const hub     = useHub()
  const liked   = ref(false)
  const count   = ref(0)
  const pending = ref(false)

  async function refresh() {
    const author = typeof postAuthor === 'object' ? postAuthor.value : postAuthor
    const id     = typeof postId     === 'object' ? postId.value     : postId
    if (!author || !id) return

    count.value = await getLikeCount(author, id)
    if (auth.isLoggedIn) {
      liked.value = await dbIsLiked(auth.address, author, id)
    }
  }

  async function toggle() {
    if (!auth.isLoggedIn || pending.value) return
    const author = typeof postAuthor === 'object' ? postAuthor.value : postAuthor
    const id     = typeof postId     === 'object' ? postId.value     : postId

    pending.value = true
    try {
      // Convert post_id hex → ArrayBuffer for encoder
      const postIdBuf     = hexToPostIdBuf(id)
      const authorBytes   = nqToAddressBytes(author)
      const isLike        = !liked.value
      const payload       = isLike
        ? buildLike({ postIdBuf, postAuthorBytes: authorBytes })
        : buildUnlike({ postIdBuf, postAuthorBytes: authorBytes })

      const signed = await hub.signTransaction({
        sender:              auth.address,
        recipient:           auth.address,
        value:               TX_VALUE_LUNA,
        fee:                 0,
        extraData:           payload,
        validityStartHeight: '+0',
      })
      await rpc.sendRawTransaction(signed.serializedTx)

      // Optimistic update
      liked.value = isLike
      count.value += isLike ? 1 : -1
    } finally {
      pending.value = false
    }
  }

  onMounted(refresh)

  return { liked, count, pending, toggle, refresh }
}

// Converts a 16-char big-endian hex post_id back to an 8-byte ArrayBuffer (LE stored)
function hexToPostIdBuf(hex) {
  const buf  = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, parseInt(hex.slice(0, 8), 16), true)   // seconds LE
  view.setUint32(4, parseInt(hex.slice(8, 16), 16), true)  // random LE
  return buf
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useLike.js
git commit -m "feat: useLike composable — like/unlike toggle with optimistic updates"
```

---

## Task 5: PostCard — Like Button + Reply Button

**Files:**
- Modify: `src/components/feed/PostCard.vue`

- [ ] **Step 1: Replace src/components/feed/PostCard.vue**

```vue
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLike } from '../../composables/useLike.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { TENTATIVE_BLOCK_CONFIRMATIONS } from '../../protocol/constants.js'

const props  = defineProps({ post: Object, tipHeight: Number })
const router = useRouter()
const auth   = useAuthStore()
const ui     = useUiStore()

const { liked, count, pending, toggle } = useLike(
  computed(() => props.post.author),
  computed(() => props.post.post_id)
)

const tentative   = computed(() => props.tipHeight && (props.tipHeight - props.post.block_height) < TENTATIVE_BLOCK_CONFIRMATIONS)
const authorShort = computed(() => props.post.author?.slice(0, 16) + '…')
const timeLabel   = computed(() => `block ${props.post.block_height}`)

function openThread() {
  router.push(`/post/${props.post.author}/${props.post.post_id}`)
}

function openReply() {
  if (!auth.isLoggedIn) { ui.loginModalOpen = true; return }
  // Store reply context in ui store, then open composer
  ui.replyTo = { author: props.post.author, postId: props.post.post_id }
  ui.composerOpen = true
}
</script>

<template>
  <div class="border-b border-gray-100 p-4 hover:bg-gray-50">
    <!-- Reply context -->
    <div v-if="post.is_reply" class="text-xs text-gray-400 mb-1 pl-13">
      ↩ Replying to
      <span class="text-blue-500 cursor-pointer hover:underline"
        @click.stop="router.push(`/profile/${post.reply_to_author}`)">
        {{ post.reply_to_author?.slice(0, 14) }}…
      </span>
    </div>

    <div class="flex gap-3">
      <!-- Avatar -->
      <div @click="router.push(`/profile/${post.author}`)"
        class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0 cursor-pointer">
        {{ post.author?.[2] ?? '?' }}
      </div>

      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-center gap-2 mb-1 cursor-pointer" @click="router.push(`/profile/${post.author}`)">
          <span class="font-semibold text-sm truncate">{{ authorShort }}</span>
          <span class="text-gray-400 text-xs">· {{ timeLabel }}</span>
          <span v-if="tentative" class="text-yellow-500 text-xs" title="Pending confirmation">⏳</span>
        </div>

        <!-- Content -->
        <p v-if="post.status === 'complete'"
          class="text-gray-900 text-sm whitespace-pre-wrap break-words cursor-pointer"
          @click="openThread">
          {{ post.content }}
        </p>
        <p v-else-if="post.status === 'missing_chunks'" class="text-gray-400 text-sm italic">Post unavailable</p>
        <p v-else class="text-gray-400 text-sm italic">Loading…</p>

        <!-- Action bar -->
        <div class="flex gap-5 mt-2">
          <!-- Reply -->
          <button @click="openReply"
            class="flex items-center gap-1 text-gray-400 hover:text-blue-500 text-xs">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>

          <!-- Like -->
          <button @click="toggle" :disabled="pending"
            :class="['flex items-center gap-1 text-xs transition-colors', liked ? 'text-red-500' : 'text-gray-400 hover:text-red-400']">
            <svg class="w-4 h-4" :fill="liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span v-if="count > 0">{{ count }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add replyTo to src/stores/ui.js**

```javascript
// Add inside useUiStore defineStore callback:
const replyTo = ref(null)   // { author: string, postId: string } | null

// Add to return:
return { loginModalOpen, composerOpen, filterNoUserReg, filterMinAgBlocks, activeTab, replyTo }
```

- [ ] **Step 3: Add route for PostDetail to src/router.js**

```javascript
// Add to routes array:
{ path: '/post/:author/:postId', component: () => import('./components/post/PostDetail.vue') },
```

- [ ] **Step 4: Commit**

```bash
git add src/components/feed/PostCard.vue src/stores/ui.js src/router.js
git commit -m "feat: PostCard with like button, like count, and reply button"
```

---

## Task 6: Reply Composition

**Files:**
- Modify: `src/composables/usePost.js`
- Modify: `src/components/post/PostComposer.vue`

- [ ] **Step 1: Verify reply fields already in usePost.js**

The Phase 1 `usePost.js` already accepts `replyToAuthor` and `replyToPostId` params in `submit()` and passes them through to `buildPostStart`. However the `replyToPostId` passed to `buildPostStart` needs to be an ArrayBuffer (8 bytes), not a hex string.

Modify the `submit()` function in `src/composables/usePost.js`. Find the `buildPostStart` call and replace it:

```javascript
// Find:
// { to: auth.address, data: buildPostStart({ postIdBuf, totalChunks: chunks.length, flags, contentHash, replyToPostId: null, replyToAuthor: null }) },

// Replace with (supports reply context):
const replyPostIdBuf = replyToPostId ? hexToReplyPostIdBuf(replyToPostId) : null
const replyAuthorBytes = replyToAuthor ? nqToAddressBytes(replyToAuthor) : null

{ to: auth.address, data: buildPostStart({
    postIdBuf,
    totalChunks: chunks.length,
    flags,
    contentHash,
    replyToPostId: replyPostIdBuf,
    replyToAuthor: replyAuthorBytes,
}) },
```

Add the helper and import at the top of `usePost.js`:

```javascript
import { nqToAddressBytes } from '../protocol/utils.js'

// Add as a module-level helper:
function hexToReplyPostIdBuf(hex) {
  const buf  = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, parseInt(hex.slice(0, 8), 16), true)
  view.setUint32(4, parseInt(hex.slice(8, 16), 16), true)
  return buf
}
```

- [ ] **Step 2: Wire reply context into PostComposer**

Replace the full `src/components/post/PostComposer.vue`:

```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePost } from '../../composables/usePost.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { db } from '../../db/schema.js'
import { MAX_POST_CHARS } from '../../protocol/constants.js'

const auth              = useAuthStore()
const ui                = useUiStore()
const { submit, submitting, error } = usePost()
const text              = ref('')
const replyContext      = ref(null)

onMounted(async () => {
  if (ui.replyTo) {
    const { author, postId } = ui.replyTo
    const post = await db.posts.get([author, postId])
    replyContext.value = post ?? { author, post_id: postId, content: null }
    ui.replyTo = null
  }
})

const charCount = computed(() => text.value.length)

async function post() {
  if (!text.value.trim() || submitting.value) return
  await submit(text.value.trim(), {
    replyToAuthor: replyContext.value?.author ?? null,
    replyToPostId: replyContext.value?.post_id ?? null,
  })
  text.value     = ''
  replyContext.value = null
}
</script>

<template>
  <div class="border-b border-gray-100 p-4">
    <!-- Reply context banner -->
    <div v-if="replyContext"
      class="mb-3 pl-3 border-l-2 border-blue-200 text-xs text-gray-400">
      <div class="font-medium text-gray-600 mb-0.5">Replying to {{ replyContext.author?.slice(0,16) }}…</div>
      <div v-if="replyContext.content" class="truncate">{{ replyContext.content }}</div>
    </div>

    <div class="flex gap-3">
      <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0">
        {{ auth.address?.[2] ?? '?' }}
      </div>
      <div class="flex-1">
        <textarea
          v-model="text"
          :maxlength="MAX_POST_CHARS"
          :placeholder="replyContext ? 'Write your reply…' : 'What\'s happening on-chain?'"
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
              {{ submitting ? 'Posting…' : replyContext ? 'Reply' : 'Post' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/composables/usePost.js src/components/post/PostComposer.vue
git commit -m "feat: reply composition — reply context banner, replyToAuthor/PostId wired through"
```

---

## Task 7: PostDetail — Thread View

**Files:**
- Create: `src/components/post/PostDetail.vue`

- [ ] **Step 1: Create src/components/post/PostDetail.vue**

```vue
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '../../db/schema.js'
import { getReplies } from '../../db/queries.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import PostCard from '../feed/PostCard.vue'
import PostSkeleton from '../feed/PostSkeleton.vue'

const route   = useRoute()
const router  = useRouter()
const { syncUser } = useIndexer()

const author  = route.params.author
const postId  = route.params.postId

const root    = ref(null)
const parent  = ref(null)
const replies = ref([])
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  try {
    // Ensure the author's address is synced
    await syncUser(author, { latestPageOnly: true })

    root.value = await db.posts.get([author, postId])

    // If this is a reply, load parent post
    if (root.value?.is_reply && root.value.reply_to_author) {
      await syncUser(root.value.reply_to_author, { latestPageOnly: true })
      parent.value = await db.posts.get([root.value.reply_to_author, root.value.reply_to_post_id])
    }

    // Load direct replies
    replies.value = await getReplies(author, postId)

    // Ensure reply authors are synced
    const uniqueAuthors = [...new Set(replies.value.map(r => r.author))]
    await Promise.allSettled(uniqueAuthors.map(a => syncUser(a, { latestPageOnly: true })))
    // Reload replies after sync (may have new complete status)
    replies.value = await getReplies(author, postId)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <!-- Back button -->
    <div class="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-10">
      <button @click="router.back()" class="text-blue-500 hover:text-blue-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>
      <span class="font-semibold text-gray-900">Post</span>
    </div>

    <div v-if="loading && !root">
      <PostSkeleton v-for="i in 3" :key="i" />
    </div>

    <template v-else>
      <!-- Parent post (if this is a reply) -->
      <div v-if="parent" class="opacity-75">
        <PostCard :post="parent" :tip-height="0" />
        <div class="w-0.5 bg-gray-200 h-4 ml-9"></div>
      </div>

      <!-- Root post (expanded, no click-through) -->
      <div v-if="root" class="p-4 border-b border-gray-100">
        <div class="flex gap-3">
          <div @click="router.push(`/profile/${root.author}`)"
            class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0 cursor-pointer">
            {{ root.author?.[2] ?? '?' }}
          </div>
          <div class="flex-1">
            <div class="font-semibold text-sm cursor-pointer hover:underline"
              @click="router.push(`/profile/${root.author}`)">
              {{ root.author?.slice(0, 20) }}…
            </div>
            <p class="mt-2 text-gray-900 whitespace-pre-wrap break-words">{{ root.content }}</p>
            <div class="text-gray-400 text-xs mt-3">Block {{ root.block_height }} · tx {{ root.tx_index }}</div>
          </div>
        </div>
      </div>

      <!-- Divider + reply prompt -->
      <div class="px-4 py-2 text-sm text-gray-400 border-b border-gray-50">
        {{ replies.length }} {{ replies.length === 1 ? 'reply' : 'replies' }}
      </div>

      <!-- Replies -->
      <PostCard v-for="reply in replies" :key="reply.post_id" :post="reply" :tip-height="0" />

      <div v-if="!replies.length && !loading"
        class="p-8 text-center text-gray-400 text-sm">
        No replies yet. Be the first!
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/post/PostDetail.vue
git commit -m "feat: PostDetail thread view — root post, parent context, and replies"
```

---

## Task 8: Run All Tests + Testnet Smoke Test

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All pass across all test files (protocol, db, indexer — handlers, assembler, follow, like).

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke test — like flow**

1. Log in with Hub
2. Navigate to any complete post in the global feed
3. Click the heart icon — Hub popup (1 tx, 1 Luna)
4. Sign the transaction
5. Expected: heart turns red, count increments by 1
6. Click again — Hub popup (UNLIKE tx)
7. Sign
8. Expected: heart turns gray, count decrements

- [ ] **Step 4: Smoke test — reply flow**

1. On any post card, click the reply icon
2. Composer opens with "Replying to [address]…" banner
3. Type a reply, click **Reply**
4. Hub popups for POST_START + POST_CHUNK(s) + POST_ANNOUNCE — sign each
5. Expected: reply appears in your profile feed with `is_reply: true`

- [ ] **Step 5: Smoke test — thread view**

1. Click on any post content (not the avatar)
2. Router navigates to `/post/:author/:postId`
3. Expected: PostDetail shows the post + any replies below it
4. If post is a reply, parent post rendered above it in gray

- [ ] **Step 6: Verify IndexedDB**

DevTools → Application → IndexedDB → nimfeed-v1:
- `likes`: row with `liker = your address`, `active: true`
- `posts` with reply: `is_reply: true`, `reply_to_author` + `reply_to_post_id` filled
- `[reply_to_author+reply_to_post_id]` index enables thread query

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: Phase 3 complete — likes, replies, thread view"
```

---

## Phase 3 Complete

All three phases of NimFeed MVP are now implemented:

| Phase | Features |
|---|---|
| Phase 1 | Protocol, indexer, global feed, post creation, profiles, Hub auth |
| Phase 2 | Follow/unfollow, following feed, username search |
| Phase 3 | Likes, replies, thread view |

**What's on-chain:**
- Every post: 3–6 transactions (POST_START + POST_CHUNK(s) + POST_ANNOUNCE)
- Every like/unlike: 1 transaction
- Every follow/unfollow: 1 transaction
- Every profile update: 1 transaction
- Every user registration: 1–3 transactions (USER_REG + optional USERNAME_CLAIM + PROFILE_SET)

**Future work** (Phase N+1 per spec §10): optional backend indexer, sharded catalogs, avatar support, PROFILE_CHUNK for longer bios.
