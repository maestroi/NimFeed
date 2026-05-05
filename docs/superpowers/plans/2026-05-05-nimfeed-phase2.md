# NimFeed Phase 2 — Social Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add follow/unfollow, a following feed, and username search — turning NimFeed from a global broadcast board into a social network.

**Architecture:** FOLLOW/UNFOLLOW events are self-transactions already defined in the protocol. The `follows` store (created in Phase 1 schema) just needs its handlers wired up. The following feed merges posts from N followed addresses using the lazy-sync-first strategy: latest page only on load, full backfill on scroll. Username search runs entirely against the local `username_claims` IndexedDB store.

**Tech Stack:** Same as Phase 1 — Vue 3, Vite, Tailwind, Pinia, Dexie, @nimiq/hub-api.

**Spec:** `docs/superpowers/specs/2026-05-05-nimfeed-design.md` §§ Phase 2, §5.3, §2.5

**Prerequisite:** Phase 1 plan complete and all tests passing.

---

## File Map

```
Modify:
  src/protocol/decoder.js          fix decodeFollowUnfollow to return NQ address
  src/indexer/handlers.js          add handleFollow + handleUnfollow
  src/db/queries.js                add follow queries + username search query
  src/composables/useFeed.js       add following feed mode
  src/components/feed/FeedView.vue add tab switcher (Global / Following)
  src/components/profile/ProfileCard.vue  add follow button + follower/following counts

Create:
  src/composables/useFollow.js
  src/components/search/UserSearch.vue
  tests/indexer/follow.handlers.test.js
  tests/protocol/decoder.follow.test.js
```

---

## Task 1: Fix Decoder — FOLLOW/UNFOLLOW Target Address

The Phase 1 decoder returns `targetAddress` as raw hex bytes. The `follows` store uses NQ-format strings for both `follower` and `followee`. Fix decoder to return NQ format consistently.

**Files:**
- Modify: `src/protocol/decoder.js`
- Modify: `tests/protocol/decoder.test.js`

- [ ] **Step 1: Add failing test for FOLLOW address format**

Add to `tests/protocol/decoder.test.js`:

```javascript
import { buildFollow, buildUnfollow } from '../../src/protocol/encoder.js'
import { nqToAddressBytes } from '../../src/protocol/utils.js'

describe('FOLLOW / UNFOLLOW address format', () => {
  it('returns targetAddress as NQ string, not hex', () => {
    const targetNq    = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
    const targetBytes = nqToAddressBytes(targetNq)
    const tx = mockTx(buildFollow(targetBytes))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('FOLLOW')
    // NQ format starts with "NQ"
    expect(ev.targetAddress).toMatch(/^NQ/)
  })

  it('returns UNFOLLOW event for unfollow payload', () => {
    const targetBytes = new Uint8Array(20).fill(2)
    const tx = mockTx(buildUnfollow(targetBytes))
    const ev = parseTransaction(tx)
    expect(ev.event).toBe('UNFOLLOW')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm test tests/protocol/decoder.test.js
```

Expected: FAIL — `targetAddress` is hex, not NQ format.

- [ ] **Step 3: Fix decodeFollowUnfollow in src/protocol/decoder.js**

Replace the existing `decodeFollowUnfollow` function:

```javascript
// OLD (Phase 1):
// function decodeFollowUnfollow(base, bytes, event) {
//   return { ...base, event, targetAddress: bytesToHex(bytes.slice(4, 24)) }
// }

// NEW:
function decodeFollowUnfollow(base, bytes, event) {
  const targetAddress = addressBytesToNq(bytes.slice(4, 24))
  return { ...base, event, targetAddress }
}
```

Also add `addressBytesToNq` to the import line at the top of `decoder.js`:

```javascript
import { hexToBytes, bytesToHex, postIdToHex, normalizeUsername, addressBytesToNq } from './utils.js'
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test tests/protocol/decoder.test.js
```

Expected: All pass including the new test.

- [ ] **Step 5: Commit**

```bash
git add src/protocol/decoder.js tests/protocol/decoder.test.js
git commit -m "fix: decoder returns NQ address for FOLLOW/UNFOLLOW targetAddress"
```

---

## Task 2: Follow Queries

**Files:**
- Modify: `src/db/queries.js`

- [ ] **Step 1: Add follow queries to src/db/queries.js**

Append to the existing `queries.js` file:

```javascript
// Follows
export const putFollow = (follow) => db.follows.put(follow)

export const getFollow = (follower, followee) =>
  db.follows.get([follower, followee])

export async function getFollowees(follower) {
  const rows = await db.follows.where('follower').equals(follower).toArray()
  return rows.filter(r => r.active).map(r => r.followee)
}

export async function getFollowers(followee) {
  const rows = await db.follows.where('followee').equals(followee).toArray()
  return rows.filter(r => r.active).map(r => r.follower)
}

export async function getFollowCounts(address) {
  const [following, followers] = await Promise.all([
    db.follows.where('follower').equals(address).filter(r => r.active).count(),
    db.follows.where('followee').equals(address).filter(r => r.active).count(),
  ])
  return { following, followers }
}

export async function isFollowing(follower, followee) {
  const row = await db.follows.get([follower, followee])
  return !!row?.active
}

// Username search — returns all username_claims sorted by block_height ASC
// so the first result for each username is the canonical owner.
export async function searchUsernames(query) {
  if (!query || query.length < 2) return []
  const normalized = query.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!normalized) return []

  const all = await db.username_claims
    .where('username')
    .startsWithIgnoreCase(normalized)
    .toArray()

  // Deduplicate — keep winning claim per username (lowest block_height, tx_index)
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
```

- [ ] **Step 2: Commit**

```bash
git add src/db/queries.js
git commit -m "feat: follow queries and username search query"
```

---

## Task 3: Follow/Unfollow Handlers

**Files:**
- Modify: `src/indexer/handlers.js`
- Create: `tests/indexer/follow.handlers.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/indexer/follow.handlers.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processTransaction } from '../../src/indexer/handlers.js'
import { buildFollow, buildUnfollow } from '../../src/protocol/encoder.js'
import { bytesToHex, nqToAddressBytes } from '../../src/protocol/utils.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const FOLLOWER = 'NQ01 FOLLOWER0000000000000000000000'
const FOLLOWEE_NQ = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001'
const followeeBytes = nqToAddressBytes(FOLLOWEE_NQ)

function selfTx(payload, from, blockHeight = 100, txIndex = 0) {
  return { hash: Math.random().toString(36), from, to: from, data: bytesToHex(payload), blockHeight, transactionIndex: txIndex, timestamp: 0 }
}

describe('FOLLOW handler', () => {
  it('stores active follow record', async () => {
    await processTransaction(selfTx(buildFollow(followeeBytes), FOLLOWER))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row).toBeTruthy()
    expect(row.active).toBe(true)
  })

  it('rejects follow that is not a self-tx', async () => {
    const tx = { hash: 'x', from: FOLLOWER, to: 'NQ99 OTHER', data: bytesToHex(buildFollow(followeeBytes)), blockHeight: 100, transactionIndex: 0 }
    await processTransaction(tx)
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row).toBeUndefined()
  })
})

describe('UNFOLLOW handler', () => {
  it('sets active=false on existing follow', async () => {
    await processTransaction(selfTx(buildFollow(followeeBytes), FOLLOWER, 100, 0))
    await processTransaction(selfTx(buildUnfollow(followeeBytes), FOLLOWER, 101, 0))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row.active).toBe(false)
  })

  it('does not overwrite a newer FOLLOW with an older UNFOLLOW', async () => {
    // Follow at block 200, then unfollow at block 100 (out of order indexing)
    await processTransaction(selfTx(buildFollow(followeeBytes), FOLLOWER, 200, 0))
    await processTransaction(selfTx(buildUnfollow(followeeBytes), FOLLOWER, 100, 0))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row.active).toBe(true)  // follow at 200 wins
  })
})
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test tests/indexer/follow.handlers.test.js
```

Expected: FAIL — FOLLOW/UNFOLLOW cases not handled.

- [ ] **Step 3: Add handlers to src/indexer/handlers.js**

In the `processTransaction` switch, replace the comment-only FOLLOW/UNFOLLOW cases:

```javascript
// Replace:
// // FOLLOW, UNFOLLOW, LIKE, UNLIKE handled in Phase 2 and 3

// With:
case TYPES.FOLLOW:
  if (!isValidSelfTx(tx)) return
  return handleFollowUnfollow(event, tx)
case TYPES.UNFOLLOW:
  if (!isValidSelfTx(tx)) return
  return handleFollowUnfollow(event, tx)
```

Add the handler function at the bottom of `handlers.js`:

```javascript
async function handleFollowUnfollow(event, tx) {
  const { putFollow, getFollow } = await import('../db/queries.js')
  const existing = await getFollow(event.from, event.targetAddress)
  const active   = event.event === 'FOLLOW'

  if (existing) {
    const isNewer =
      event.blockHeight > existing.block_height ||
      (event.blockHeight === existing.block_height && event.txIndex > existing.tx_index)
    if (!isNewer) return
  }

  await putFollow({
    follower:     event.from,
    followee:     event.targetAddress,
    active,
    block_height: event.blockHeight,
    tx_index:     event.txIndex,
  })
}
```

Also add `getFollow` and `putFollow` to the existing import at the top of `handlers.js`:

```javascript
import {
  putUser, getUser, updateUser,
  putPost, getPost, updatePost,
  putChunk,
  putCatalogRef,
  putUsernameClaim,
  putFollow, getFollow,
} from '../db/queries.js'
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/indexer/follow.handlers.test.js
```

Expected: All pass.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/indexer/handlers.js tests/indexer/follow.handlers.test.js
git commit -m "feat: FOLLOW/UNFOLLOW handlers with latest-wins conflict resolution"
```

---

## Task 4: useFollow Composable

**Files:**
- Create: `src/composables/useFollow.js`

- [ ] **Step 1: Create src/composables/useFollow.js**

```javascript
import { ref, computed, watch, onMounted } from 'vue'
import { useHub } from '../chain/hub.js'
import { rpc } from '../chain/rpc.js'
import { buildFollow, buildUnfollow } from '../protocol/encoder.js'
import { nqToAddressBytes } from '../protocol/utils.js'
import { TX_VALUE_LUNA } from '../protocol/constants.js'
import { isFollowing as dbIsFollowing, getFollowCounts } from '../db/queries.js'
import { useAuthStore } from '../stores/auth.js'

export function useFollow(targetAddress) {
  const auth    = useAuthStore()
  const hub     = useHub()
  const active  = ref(false)
  const counts  = ref({ following: 0, followers: 0 })
  const pending = ref(false)

  async function refresh() {
    if (!targetAddress) return
    const addr = typeof targetAddress === 'object' ? targetAddress.value : targetAddress
    if (!addr) return
    counts.value = await getFollowCounts(addr)
    if (auth.isLoggedIn) {
      active.value = await dbIsFollowing(auth.address, addr)
    }
  }

  async function sendFollowTx(isFollow) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const addr         = typeof targetAddress === 'object' ? targetAddress.value : targetAddress
    const targetBytes  = nqToAddressBytes(addr)
    const payload      = isFollow ? buildFollow(targetBytes) : buildUnfollow(targetBytes)
    const height       = await rpc.getBlockNumber()

    const signed = await hub.signTransaction({
      sender:              auth.address,
      recipient:           auth.address,
      value:               TX_VALUE_LUNA,
      fee:                 0,
      extraData:           payload,
      validityStartHeight: '+0',
    })
    await rpc.sendRawTransaction(signed.serializedTx)
  }

  async function follow() {
    if (pending.value) return
    pending.value = true
    try {
      await sendFollowTx(true)
      active.value = true
      counts.value = { ...counts.value, followers: counts.value.followers + 1 }
    } finally {
      pending.value = false
    }
  }

  async function unfollow() {
    if (pending.value) return
    pending.value = true
    try {
      await sendFollowTx(false)
      active.value = false
      counts.value = { ...counts.value, followers: Math.max(0, counts.value.followers - 1) }
    } finally {
      pending.value = false
    }
  }

  if (typeof targetAddress === 'object' && targetAddress?.value !== undefined) {
    watch(targetAddress, refresh, { immediate: true })
  } else {
    onMounted(refresh)
  }

  return { active, counts, pending, follow, unfollow, refresh }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useFollow.js
git commit -m "feat: useFollow composable — follow/unfollow actions and count tracking"
```

---

## Task 5: Following Feed

**Files:**
- Modify: `src/composables/useFeed.js`

The following feed syncs only the latest page per followee on first load. Full backfill is deferred until the user scrolls into older history.

- [ ] **Step 1: Add following feed mode to src/composables/useFeed.js**

Replace the entire `useFeed.js` with the extended version:

```javascript
import { ref, onMounted } from 'vue'
import { useFeedStore } from '../stores/feed.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { getCatalogRefs, getFollowees, getPostsByAuthor } from '../db/queries.js'
import { db } from '../db/schema.js'
import { FEED_PAGE_SIZE } from '../protocol/constants.js'
import { useAuthStore } from '../stores/auth.js'

// mode: 'global' | 'following'
export function useFeed(mode = 'global') {
  const store        = useFeedStore()
  const { syncCatalog, syncUser } = useIndexer()
  const auth         = useAuthStore()
  const cursor       = ref({ block_height: Infinity, tx_index: Infinity })
  const followeesRef = ref([])

  // --- Global feed ---

  async function loadGlobalPage() {
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

  async function refreshGlobal() {
    store.clear()
    cursor.value = { block_height: Infinity, tx_index: Infinity }
    await syncCatalog()
    await loadGlobalPage()
  }

  // --- Following feed ---

  async function refreshFollowing() {
    if (!auth.isLoggedIn) return
    store.clear()

    const followees = await getFollowees(auth.address)
    followeesRef.value = followees

    // Sync only the newest page per followee — fast initial load
    await Promise.allSettled(followees.map(addr => syncUser(addr, { latestPageOnly: true })))

    await loadFollowingPage(true)
  }

  async function loadFollowingPage(reset = false) {
    if (!auth.isLoggedIn) return
    store.loading = true
    try {
      const followees = followeesRef.value.length
        ? followeesRef.value
        : await getFollowees(auth.address)

      // Fetch complete posts from all followees — sort and paginate client-side
      const allArrays = await Promise.all(
        followees.map(addr => getPostsByAuthor(addr))
      )
      const all = allArrays
        .flat()
        .filter(p => p.status === 'complete')
        .sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)

      const cutoff = reset
        ? 0
        : store.posts.length

      const page = all.slice(cutoff, cutoff + FEED_PAGE_SIZE)
      store.appendPosts(page)
      store.hasMore = all.length > cutoff + FEED_PAGE_SIZE
    } finally {
      store.loading = false
    }
  }

  // Full backfill for a followee — triggered when scrolling to older history
  async function backfillFollowee(address) {
    await syncUser(address, { latestPageOnly: false })
    await loadFollowingPage()
  }

  // --- Unified API ---

  async function refresh() {
    return mode === 'following' ? refreshFollowing() : refreshGlobal()
  }

  async function loadPage() {
    return mode === 'following' ? loadFollowingPage() : loadGlobalPage()
  }

  onMounted(refresh)

  return {
    posts:    store.posts,
    loading:  store.loading,
    hasMore:  store.hasMore,
    loadPage,
    refresh,
    backfillFollowee,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useFeed.js
git commit -m "feat: useFeed extended with following feed mode and latestPageOnly sync"
```

---

## Task 6: Feed Tabs (Global / Following)

**Files:**
- Modify: `src/stores/ui.js`
- Modify: `src/components/feed/FeedView.vue`

- [ ] **Step 1: Add activeTab to src/stores/ui.js**

Add to the `useUiStore` return:

```javascript
// Add inside defineStore callback, alongside existing refs:
const activeTab = ref('global')  // 'global' | 'following'

// Add to return:
return { loginModalOpen, composerOpen, filterNoUserReg, filterMinAgBlocks, activeTab }
```

Full updated `src/stores/ui.js`:

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const loginModalOpen    = ref(false)
  const composerOpen      = ref(false)
  const filterNoUserReg   = ref(true)
  const filterMinAgBlocks = ref(10)
  const activeTab         = ref('global')   // 'global' | 'following'

  return { loginModalOpen, composerOpen, filterNoUserReg, filterMinAgBlocks, activeTab }
})
```

- [ ] **Step 2: Update src/components/feed/FeedView.vue with tabs**

```vue
<script setup>
import { watch } from 'vue'
import { useFeed } from '../../composables/useFeed.js'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import PostCard from './PostCard.vue'
import PostSkeleton from './PostSkeleton.vue'

const ui   = useUiStore()
const auth = useAuthStore()

const globalFeed    = useFeed('global')
const followingFeed = useFeed('following')

const current = () => ui.activeTab === 'following' ? followingFeed : globalFeed

function switchTab(tab) {
  if (tab === ui.activeTab) return
  ui.activeTab = tab
}
</script>

<template>
  <div>
    <div class="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-100 z-10">
      <div class="flex">
        <button
          @click="switchTab('global')"
          :class="['flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
            ui.activeTab === 'global'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-400 hover:text-gray-600']">
          Home
        </button>
        <button
          @click="auth.isLoggedIn ? switchTab('following') : (ui.loginModalOpen = true)"
          :class="['flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
            ui.activeTab === 'following'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-400 hover:text-gray-600']">
          Following
        </button>
      </div>
    </div>

    <template v-if="ui.activeTab === 'global'">
      <div v-if="globalFeed.loading && !globalFeed.posts.length">
        <PostSkeleton v-for="i in 5" :key="i" />
      </div>
      <template v-else>
        <template v-for="post in globalFeed.posts" :key="post.post_id">
          <PostSkeleton v-if="post._skeleton" />
          <PostCard v-else :post="post" :tip-height="0" />
        </template>
        <div v-if="globalFeed.hasMore" class="p-4 text-center">
          <button @click="globalFeed.loadPage" :disabled="globalFeed.loading"
            class="text-blue-500 text-sm hover:text-blue-700 disabled:opacity-50">
            {{ globalFeed.loading ? 'Loading…' : 'Load more' }}
          </button>
        </div>
        <div v-else class="p-8 text-center text-gray-400 text-sm">You've reached the beginning.</div>
      </template>
    </template>

    <template v-else-if="ui.activeTab === 'following'">
      <div v-if="followingFeed.loading && !followingFeed.posts.length">
        <PostSkeleton v-for="i in 5" :key="i" />
      </div>
      <div v-else-if="!followingFeed.posts.length && !followingFeed.loading"
        class="p-10 text-center text-gray-400 text-sm">
        Follow some users to see their posts here.
      </div>
      <template v-else>
        <PostCard v-for="post in followingFeed.posts" :key="post.post_id" :post="post" :tip-height="0" />
        <div v-if="followingFeed.hasMore" class="p-4 text-center">
          <button @click="followingFeed.loadPage" :disabled="followingFeed.loading"
            class="text-blue-500 text-sm hover:text-blue-700 disabled:opacity-50">
            {{ followingFeed.loading ? 'Loading…' : 'Load more' }}
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/ui.js src/components/feed/FeedView.vue
git commit -m "feat: feed tabs — Global and Following with tab state in Pinia"
```

---

## Task 7: Profile Card — Follow Button + Counts

**Files:**
- Modify: `src/components/profile/ProfileCard.vue`

- [ ] **Step 1: Replace src/components/profile/ProfileCard.vue**

```vue
<script setup>
import { computed } from 'vue'
import { useFollow } from '../../composables/useFollow.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'

const props  = defineProps({ user: Object, address: String })
const auth   = useAuthStore()
const ui     = useUiStore()
const { active, counts, pending, follow, unfollow } = useFollow(computed(() => props.address))

const isSelf = computed(() => auth.address === props.address)

function handleFollowClick() {
  if (!auth.isLoggedIn) { ui.loginModalOpen = true; return }
  active.value ? unfollow() : follow()
}
</script>

<template>
  <div class="p-6 border-b border-gray-100">
    <div class="flex items-start justify-between">
      <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold">
        {{ address?.[2] ?? '?' }}
      </div>

      <button v-if="!isSelf"
        @click="handleFollowClick"
        :disabled="pending"
        :class="[
          'px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50',
          active
            ? 'border border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-500'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        ]">
        {{ pending ? '…' : active ? 'Following' : 'Follow' }}
      </button>
    </div>

    <div class="mt-3">
      <div class="font-bold text-lg">{{ user?.display_name ?? 'Anonymous' }}</div>
      <div v-if="user?.username" class="text-gray-500 text-sm">@{{ user.username }}</div>
      <div class="text-gray-400 text-xs mt-1 font-mono break-all">{{ address }}</div>
      <p v-if="user?.bio" class="mt-3 text-gray-700 text-sm">{{ user.bio }}</p>
    </div>

    <div class="flex gap-5 mt-4 text-sm">
      <span>
        <strong class="text-gray-900">{{ counts.following }}</strong>
        <span class="text-gray-500 ml-1">Following</span>
      </span>
      <span>
        <strong class="text-gray-900">{{ counts.followers }}</strong>
        <span class="text-gray-500 ml-1">{{ counts.followers === 1 ? 'Follower' : 'Followers' }}</span>
      </span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/profile/ProfileCard.vue
git commit -m "feat: profile card with follow button and follower/following counts"
```

---

## Task 8: Username Search

**Files:**
- Create: `src/components/search/UserSearch.vue`
- Modify: `src/components/layout/BottomNav.vue`
- Modify: `src/router.js`

- [ ] **Step 1: Add search route to src/router.js**

```javascript
// Add to routes array:
{ path: '/search', component: () => import('../components/search/UserSearch.vue') },
```

Full updated `src/router.js`:

```javascript
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/',                     component: () => import('./components/feed/FeedView.vue') },
  { path: '/profile/:address',     component: () => import('./components/profile/ProfileView.vue') },
  { path: '/post',                 component: () => import('./components/post/PostComposer.vue') },
  { path: '/search',               component: () => import('./components/search/UserSearch.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
```

- [ ] **Step 2: Create src/components/search/UserSearch.vue**

```vue
<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { searchUsernames } from '../../db/queries.js'
import { getUser } from '../../db/queries.js'

const router  = useRouter()
const query   = ref('')
const results = ref([])
const loading = ref(false)

watch(query, async (val) => {
  if (val.length < 2) { results.value = []; return }
  loading.value = true
  try {
    const claims = await searchUsernames(val)
    results.value = await Promise.all(claims.map(async claim => {
      const user = await getUser(claim.address)
      return { ...claim, displayName: user?.display_name ?? null }
    }))
  } finally {
    loading.value = false
  }
}, { debounce: 300 })

function goToProfile(address) {
  router.push(`/profile/${address}`)
}
</script>

<template>
  <div class="p-4">
    <div class="sticky top-0 bg-white pb-3">
      <input
        v-model="query"
        type="search"
        placeholder="Search usernames…"
        autofocus
        class="w-full border border-gray-200 rounded-full px-4 py-2.5 text-sm outline-none focus:border-blue-400"
      />
    </div>

    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">Searching…</div>

    <div v-else-if="results.length === 0 && query.length >= 2"
      class="text-center py-8 text-gray-400 text-sm">
      No users found for "{{ query }}"
    </div>

    <ul v-else>
      <li v-for="result in results" :key="result.address"
        @click="goToProfile(result.address)"
        class="flex items-center gap-3 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 px-1 rounded-lg">
        <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shrink-0">
          {{ result.address[2] ?? '?' }}
        </div>
        <div>
          <div class="font-semibold text-sm">@{{ result.username }}</div>
          <div v-if="result.displayName" class="text-gray-500 text-xs">{{ result.displayName }}</div>
          <div class="text-gray-400 text-xs font-mono">{{ result.address.slice(0, 20) }}…</div>
        </div>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 3: Add search tab to src/components/layout/BottomNav.vue**

Replace the full `BottomNav.vue`:

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
  <nav class="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex justify-around py-2 z-40">
    <!-- Home -->
    <button @click="router.push('/')" :class="route.path === '/' ? 'text-blue-600' : 'text-gray-400'" class="flex flex-col items-center p-2">
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M3 12l9-9 9 9v9H15v-6H9v6H3z"/></svg>
    </button>

    <!-- Search -->
    <button @click="router.push('/search')" :class="route.path === '/search' ? 'text-blue-600' : 'text-gray-400'" class="flex flex-col items-center p-2">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    </button>

    <!-- Compose -->
    <button @click="auth.isLoggedIn ? (ui.composerOpen = true) : (ui.loginModalOpen = true)"
      class="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white -mt-3 shadow-lg hover:bg-blue-700">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
    </button>

    <!-- Profile -->
    <button @click="auth.isLoggedIn ? router.push(`/profile/${auth.address}`) : (ui.loginModalOpen = true)"
      :class="route.path.startsWith('/profile') ? 'text-blue-600' : 'text-gray-400'" class="flex flex-col items-center p-2">
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
    </button>
  </nav>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/router.js src/components/search/UserSearch.vue src/components/layout/BottomNav.vue
git commit -m "feat: username search view and search tab in bottom nav"
```

---

## Task 9: Run All Tests + Testnet Smoke Test

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All pass. Check that the new handler tests and the fixed decoder tests all green.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke test — follow flow**

1. Log in with Hub
2. Navigate to any profile address in the search or global feed
3. Click **Follow** — Hub popup appears (1 tx, 1 Luna)
4. Sign the transaction
5. Expected: button changes to "Following", follower count increments
6. Click **Following** — Hub popup appears (1 tx, 1 Luna)
7. Sign the transaction
8. Expected: button reverts to "Follow", follower count decrements

- [ ] **Step 4: Smoke test — following feed**

1. Follow at least one user who has posted
2. Click the **Following** tab
3. Expected: their posts appear (may take a few seconds while their address syncs)
4. Scroll to bottom — **Load more** fetches older history

- [ ] **Step 5: Smoke test — username search**

1. Tap the search icon in the bottom nav
2. Type the first 3 letters of a registered username
3. Expected: matching results appear with username + display name
4. Tap a result — navigates to that user's profile

- [ ] **Step 6: Verify IndexedDB**

DevTools → Application → IndexedDB → nimfeed-v1:
- `follows`: row with `follower = your address`, `followee = followed address`, `active: true`
- After unfollow: same row with `active: false`
- `username_claims`: populated with any USERNAME_CLAIM events from synced addresses

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: Phase 2 complete — follow graph, following feed, username search"
```

---

## Phase 2 Complete

FOLLOW/UNFOLLOW on-chain with latest-wins conflict resolution. Following feed with lazy sync (latest-page-first, backfill on scroll). Username search from local IndexedDB. Profile card with follow button and counts. Global/Following feed tabs.

**Phase 3 plan** (likes + replies + threads): `docs/superpowers/plans/2026-05-05-nimfeed-phase3.md`
