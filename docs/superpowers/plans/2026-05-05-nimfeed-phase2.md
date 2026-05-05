# NimFeed Phase 2 — Social Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add follow/unfollow, a following feed, and username search — turning NimFeed from a global broadcast board into a social network.

**Architecture:** FOLLOW/UNFOLLOW events are sent to `FOLLOW_CATALOG_ADDRESS` (not self-transactions). The indexer adds `syncFollowCatalog()` already scaffolded in Phase 1. The `follows` store (created in Phase 1 schema) just needs its handlers wired up. The following feed is built entirely from `catalog_refs` filtered by followee addresses — no per-user address sync needed. Username search runs against the local `profile_claims` IndexedDB store.

**Tech Stack:** Same as Phase 1 — Vue 3, Vite, Tailwind, Pinia, Dexie, @nimiq/hub-api.

**Spec:** `docs/superpowers/specs/2026-05-05-nimfeed-design.md` §§ Phase 2, §5.3, §2.5

**Prerequisite:** Phase 1 plan complete and all tests passing.

---

## File Map

```
Modify:
  src/indexer/handlers.js          handleFollow/handleUnfollow already there; verify and test
  src/db/queries.js                add follow queries + username search already in Phase 1; verify
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

## Task 1: Verify Follow Handlers (Tests First)

The `handleFollow` function was stubbed in Phase 1 `handlers.js`. This task adds tests and confirms correct behavior.

**Files:**
- Create: `tests/indexer/follow.handlers.test.js`
- Modify: `src/indexer/handlers.js` if stub is incomplete

- [ ] **Step 1: Write failing tests**

Create `tests/indexer/follow.handlers.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/db/schema.js'
import { processFollowCatalogTx } from '../../src/indexer/handlers.js'
import { buildFollow, buildUnfollow } from '../../src/protocol/encoder.js'
import { bytesToHex, addressBytesToNq } from '../../src/protocol/utils.js'
import { FOLLOW_CATALOG_ADDRESS } from '../../src/protocol/constants.js'

beforeEach(async () => { await db.delete(); await db.open() })

const FOLLOWER  = 'NQ01FOLLOWER000000000000000000000'
const FOLLOWEE_BYTES = new Uint8Array(20).fill(7)
const FOLLOWEE_NQ    = addressBytesToNq(FOLLOWEE_BYTES)

function followTx(payload, from = FOLLOWER, blockHeight = 100, txIndex = 0) {
  return {
    hash: Math.random().toString(36),
    from, to: FOLLOW_CATALOG_ADDRESS,
    data: bytesToHex(payload),
    blockHeight, transactionIndex: txIndex, timestamp: 0,
  }
}

describe('FOLLOW handler', () => {
  it('stores active follow record', async () => {
    await processFollowCatalogTx(followTx(buildFollow(FOLLOWEE_BYTES)))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row).toBeTruthy()
    expect(row.active).toBe(true)
  })

  it('rejects tx not sent to FOLLOW_CATALOG_ADDRESS', async () => {
    const tx = { ...followTx(buildFollow(FOLLOWEE_BYTES)), to: 'NQ_OTHER' }
    await processFollowCatalogTx(tx)
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row).toBeUndefined()
  })
})

describe('UNFOLLOW handler', () => {
  it('sets active=false on existing follow', async () => {
    await processFollowCatalogTx(followTx(buildFollow(FOLLOWEE_BYTES), FOLLOWER, 100, 0))
    await processFollowCatalogTx(followTx(buildUnfollow(FOLLOWEE_BYTES), FOLLOWER, 101, 0))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row.active).toBe(false)
  })

  it('does not overwrite a newer FOLLOW with an older UNFOLLOW', async () => {
    await processFollowCatalogTx(followTx(buildFollow(FOLLOWEE_BYTES),   FOLLOWER, 200, 0))
    await processFollowCatalogTx(followTx(buildUnfollow(FOLLOWEE_BYTES), FOLLOWER, 100, 0))
    const row = await db.follows.get([FOLLOWER, FOLLOWEE_NQ])
    expect(row.active).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test tests/indexer/follow.handlers.test.js
```

- [ ] **Step 3: Confirm/fix handleFollow in src/indexer/handlers.js**

The Phase 1 stub should already handle this. If any test fails, patch `handleFollow` so the latest-wins logic is correct:

```javascript
async function handleFollow(ev) {
  const { db } = await import('../db/schema.js')
  const key      = [ev.from, ev.targetAddress]
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

- [ ] **Step 4: Run — expect pass**

```bash
npm test tests/indexer/follow.handlers.test.js
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/indexer/handlers.js tests/indexer/follow.handlers.test.js
git commit -m "feat: FOLLOW/UNFOLLOW handlers with latest-wins conflict resolution (TDD)"
```

---

## Task 2: Follow Queries

Verify the follow queries added in Phase 1 `queries.js` are complete. Add any missing ones.

**Files:**
- Modify: `src/db/queries.js`

- [ ] **Step 1: Confirm these functions exist in queries.js; add any that are missing**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/db/queries.js
git commit -m "feat: follow count and isFollowing query helpers"
```

---

## Task 3: useFollow Composable

**Files:**
- Create: `src/composables/useFollow.js`

- [ ] **Step 1: Create src/composables/useFollow.js**

```javascript
import { ref, computed, watch, onMounted } from 'vue'
import { useHub } from '../chain/hub.js'
import { rpc } from '../chain/rpc.js'
import { buildFollow, buildUnfollow } from '../protocol/encoder.js'
import { nqToAddressBytes } from '../protocol/address.js'
import { TX_VALUE_LUNA, FOLLOW_CATALOG_ADDRESS } from '../protocol/constants.js'
import { isFollowing as dbIsFollowing, getFollowCounts } from '../db/queries.js'
import { useAuthStore } from '../stores/auth.js'

export function useFollow(targetAddress) {
  const auth    = useAuthStore()
  const hub     = useHub()
  const active  = ref(false)
  const counts  = ref({ following: 0, followers: 0 })
  const pending = ref(false)

  async function refresh() {
    const addr = typeof targetAddress === 'object' ? targetAddress.value : targetAddress
    if (!addr) return
    counts.value = await getFollowCounts(addr)
    if (auth.isLoggedIn) {
      active.value = await dbIsFollowing(auth.address, addr)
    }
  }

  async function sendFollowTx(isFollow) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const addr        = typeof targetAddress === 'object' ? targetAddress.value : targetAddress
    const targetBytes = nqToAddressBytes(addr)
    const payload     = isFollow ? buildFollow(targetBytes) : buildUnfollow(targetBytes)

    const signed = await hub.signTransaction({
      sender:    auth.address,
      recipient: FOLLOW_CATALOG_ADDRESS,
      value:     TX_VALUE_LUNA,
      fee:       0,
      extraData: payload,
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
git commit -m "feat: useFollow composable — sends to FOLLOW_CATALOG, optimistic state"
```

---

## Task 4: Following Feed

**Files:**
- Modify: `src/composables/useFeed.js`

The following feed is built entirely from `catalog_refs` — filter by followee set, no per-user address sync needed.

- [ ] **Step 1: Extend useFeed.js with following mode**

Replace the entire `useFeed.js`:

```javascript
import { ref, onMounted } from 'vue'
import { useFeedStore } from '../stores/feed.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { getCatalogRefs, getCatalogRefsBySender, getPost, getFollowees } from '../db/queries.js'
import { FEED_PAGE_SIZE } from '../protocol/constants.js'
import { useAuthStore } from '../stores/auth.js'

export function useFeed(mode = 'global') {
  const store   = useFeedStore()
  const indexer = useIndexer()
  const auth    = useAuthStore()
  const cursor  = ref({ block_height: Infinity, tx_index: Infinity })

  // --- Global feed ---

  async function loadGlobalPage() {
    store.loading = true
    try {
      const refs = await getCatalogRefs(['POST_INLINE', 'POST_START'], {
        limit:         FEED_PAGE_SIZE,
        beforeHeight:  cursor.value.block_height,
        beforeTxIndex: cursor.value.tx_index,
      })

      const posts = await resolvePosts(refs)

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
    await indexer?.startDeltaSync()
    await loadGlobalPage()
  }

  // --- Following feed ---

  async function refreshFollowing() {
    if (!auth.isLoggedIn) return
    store.clear()

    // Sync follow catalog to get latest followee list
    await indexer?.syncFollowCatalog()

    const followees = await getFollowees(auth.address)
    await loadFollowingPage(followees, true)
  }

  async function loadFollowingPage(followees, reset = false) {
    if (!auth.isLoggedIn) return
    store.loading = true
    try {
      if (!followees) followees = await getFollowees(auth.address)

      const allArrays = await Promise.all(
        followees.map(addr => getCatalogRefsBySender(addr, ['POST_INLINE', 'POST_START']))
      )

      const allRefs = allArrays.flat()
        .sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)

      const cutoff = reset ? 0 : store.posts.length
      const page   = allRefs.slice(cutoff, cutoff + FEED_PAGE_SIZE)
      const posts  = await resolvePosts(page)

      store.appendPosts(posts)
      store.hasMore = allRefs.length > cutoff + FEED_PAGE_SIZE
    } finally {
      store.loading = false
    }
  }

  // --- Shared helpers ---

  async function resolvePosts(refs) {
    return Promise.all(refs.map(async ref => {
      const post = await getPost(ref.sender, ref.post_id)
      if (!post) {
        if (ref.type === 'POST_START') triggerDerivedSync(ref)
        return { author: ref.sender, post_id: ref.post_id, status: 'pending', block_height: ref.block_height, content: null, _skeleton: true }
      }
      return post
    }))
  }

  async function triggerDerivedSync(ref) {
    const { nqToAddressBytes, addressBytesToNq, derivePostAddress } = await import('../protocol/address.js')
    const authorBytes  = nqToAddressBytes(ref.sender)
    const postIdBytes  = hexToPostIdBytes(ref.post_id)
    const derivedBytes = await derivePostAddress(authorBytes, postIdBytes)
    const derivedNq    = addressBytesToNq(derivedBytes)
    indexer?.syncDerivedAddress(derivedNq).catch(() => {})
  }

  // --- Unified API ---

  async function refresh() {
    return mode === 'following' ? refreshFollowing() : refreshGlobal()
  }

  async function loadPage() {
    if (mode === 'following') {
      const followees = await getFollowees(auth.address)
      return loadFollowingPage(followees)
    }
    return loadGlobalPage()
  }

  onMounted(refresh)

  return {
    posts:   store.posts,
    loading: store.loading,
    hasMore: store.hasMore,
    loadPage,
    refresh,
  }
}

function hexToPostIdBytes(hex16) {
  const reversed = []
  for (let i = 0; i < 16; i += 2) reversed.unshift(parseInt(hex16.slice(i, i + 2), 16))
  return new Uint8Array(reversed)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/useFeed.js
git commit -m "feat: useFeed extended with following feed mode — catalog-only, no per-user sync"
```

---

## Task 5: Feed Tabs + Profile Card

**Files:**
- Modify: `src/stores/ui.js`
- Modify: `src/components/feed/FeedView.vue`
- Modify: `src/components/profile/ProfileCard.vue`

- [ ] **Step 1: Add activeTab to ui store**

```javascript
// Add to useUiStore defineStore callback:
const activeTab = ref('global')  // 'global' | 'following'
// Add to return:
return { ..., activeTab }
```

- [ ] **Step 2: Update FeedView.vue with tabs**

```vue
<script setup>
import { useFeed } from '../../composables/useFeed.js'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import PostCard from './PostCard.vue'
import PostSkeleton from './PostSkeleton.vue'

const ui            = useUiStore()
const auth          = useAuthStore()
const globalFeed    = useFeed('global')
const followingFeed = useFeed('following')

function switchTab(tab) {
  if (tab === ui.activeTab) return
  ui.activeTab = tab
}
</script>

<template>
  <div>
    <div class="sticky top-0 bg-white/90 backdrop-blur border-b border-gray-100 z-10">
      <div class="flex">
        <button @click="switchTab('global')"
          :class="['flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
            ui.activeTab === 'global'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-400 hover:text-gray-600']">
          Home
        </button>
        <button @click="auth.isLoggedIn ? switchTab('following') : (ui.loginModalOpen = true)"
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
          <PostCard v-else :post="post" />
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
        <PostCard v-for="post in followingFeed.posts" :key="post.post_id" :post="post" />
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

- [ ] **Step 3: Update ProfileCard.vue with follow button + counts**

```vue
<script setup>
import { computed } from 'vue'
import { useFollow } from '../../composables/useFollow.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'

const props = defineProps({ user: Object, address: String })
const auth  = useAuthStore()
const ui    = useUiStore()
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
      <button v-if="!isSelf" @click="handleFollowClick" :disabled="pending"
        :class="['px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-50',
          active
            ? 'border border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-500'
            : 'bg-blue-600 text-white hover:bg-blue-700']">
        {{ pending ? '…' : active ? 'Following' : 'Follow' }}
      </button>
    </div>
    <div class="mt-3">
      <div class="font-bold text-lg">{{ user?.display_name ?? 'Anonymous' }}</div>
      <div v-if="user?.username" class="text-gray-500 text-sm">@{{ user.username }}</div>
      <div class="text-gray-400 text-xs mt-1 font-mono break-all">{{ address }}</div>
    </div>
    <div class="flex gap-5 mt-4 text-sm">
      <span><strong class="text-gray-900">{{ counts.following }}</strong> <span class="text-gray-500 ml-1">Following</span></span>
      <span><strong class="text-gray-900">{{ counts.followers }}</strong> <span class="text-gray-500 ml-1">{{ counts.followers === 1 ? 'Follower' : 'Followers' }}</span></span>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui.js src/components/feed/FeedView.vue src/components/profile/ProfileCard.vue
git commit -m "feat: feed tabs, follow button, follower/following counts"
```

---

## Task 6: Username Search

**Files:**
- Create: `src/components/search/UserSearch.vue`
- Modify: `src/router.js`
- Modify: `src/components/layout/BottomNav.vue`

- [ ] **Step 1: Add /search route**

```javascript
// Add to routes array in src/router.js:
{ path: '/search', component: () => import('./components/search/UserSearch.vue') },
```

- [ ] **Step 2: Create src/components/search/UserSearch.vue**

```vue
<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { searchUsernames, getUser } from '../../db/queries.js'

const router  = useRouter()
const query   = ref('')
const results = ref([])
const loading = ref(false)

let debounce = null
watch(query, async (val) => {
  clearTimeout(debounce)
  if (val.length < 2) { results.value = []; return }
  debounce = setTimeout(async () => {
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
  }, 300)
})
</script>

<template>
  <div class="p-4">
    <div class="sticky top-0 bg-white pb-3">
      <input v-model="query" type="search" placeholder="Search usernames…" autofocus
        class="w-full border border-gray-200 rounded-full px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
    </div>
    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">Searching…</div>
    <div v-else-if="results.length === 0 && query.length >= 2"
      class="text-center py-8 text-gray-400 text-sm">No users found for "{{ query }}"</div>
    <ul v-else>
      <li v-for="result in results" :key="result.address"
        @click="router.push(`/profile/${result.address}`)"
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

- [ ] **Step 3: Add search to BottomNav.vue**

Add a search icon button between home and compose that routes to `/search`.

- [ ] **Step 4: Commit**

```bash
git add src/router.js src/components/search/ src/components/layout/BottomNav.vue
git commit -m "feat: username search view and search tab in bottom nav"
```

---

## Task 7: Run All Tests + Testnet Smoke Test

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Smoke test — follow flow**

1. Log in, navigate to any profile
2. Click **Follow** — 1 Hub popup (FOLLOW → FOLLOW_CATALOG_ADDRESS)
3. Sign → button shows "Following", follower count increments
4. Click **Following** → 1 Hub popup (UNFOLLOW → FOLLOW_CATALOG_ADDRESS)
5. Sign → reverts to "Follow", follower count decrements

- [ ] **Step 4: Smoke test — following feed**

1. Follow a user who has posted
2. Click **Following** tab
3. Expected: their posts appear (from catalog_refs filtered by followee)

- [ ] **Step 5: Smoke test — username search**

1. Tap search icon
2. Type first 3 chars of a claimed username
3. Expected: results with username + display name
4. Tap result → profile view

- [ ] **Step 6: Verify IndexedDB**

DevTools → Application → IndexedDB → nimfeed-v1:
- `follows`: row with `follower`, `followee`, `active: true`
- After unfollow: same row with `active: false`
- `profile_claims`: populated from catalog sync

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: Phase 2 complete — follow graph, following feed, username search"
```

---

## Phase 2 Complete

FOLLOW/UNFOLLOW on-chain via FOLLOW_CATALOG (1 tx each, no self-tx). Following feed built entirely from catalog_refs. Username search from local profile_claims store. Profile card with follow button and counts.

**Phase 3 plan** (reply threads): `docs/superpowers/plans/2026-05-05-nimfeed-phase3.md`
