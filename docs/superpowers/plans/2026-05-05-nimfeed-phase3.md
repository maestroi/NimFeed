# NimFeed Phase 3 — Thread View

**Date:** 2026-05-05  
**Canonical spec:** `docs/superpowers/specs/2026-05-05-nimfeed-design.md` §8 Phase 3

**Prerequisite:** Phase 2 complete.

---

## Context

Reply encoding is already in the protocol from Phase 1:
- `POST_INLINE` with `is_reply=1` carries `reply_to_author` (20 bytes) and `reply_to_post_id` (8 bytes).
- `POST_START` with `is_reply` flag carries the same fields.
- `posts` store has `[reply_to_author+reply_to_post_id]` compound index.
- `getReplies(author, postId)` query already exists in `src/db/queries.js`.

Phase 3 is purely a UI concern — wire up the thread view.

**Likes are not part of V1.** Do not implement LIKE/UNLIKE.

---

## Scope checklist

- [ ] Reply composition: PostComposer accepts `replyTo` prop → pre-fills `reply_to_*` in payload
- [ ] PostCard shows "Replying to @username" header when `is_reply === true`
- [ ] Thread view at `/thread/:address/:postId` — parent post + replies sorted by `(block_height, tx_index)`
- [ ] `PostThreadView` component uses `getReplies(address, postId)`
- [ ] Router entry for `/thread/:address/:postId`

---

## Files

```
Create:
  src/components/post/PostThreadView.vue

Modify:
  src/components/post/PostComposer.vue    accept replyTo prop
  src/components/feed/PostCard.vue        show reply context + link to thread
  src/router.js                           add /thread/:address/:postId route
```

---

## Task 1: Reply-Aware PostComposer

- [ ] **Step 1: Add `replyTo` prop to PostComposer.vue**

```vue
<script setup>
const props = defineProps({
  replyTo: {
    type: Object,  // { author: string, postId: string, username: string|null }
    default: null,
  }
})
</script>
```

- [ ] **Step 2: Pass replyTo into usePost().submitPost()**

```javascript
await submitPost(text, {
  replyToAuthor: props.replyTo?.author ?? null,
  replyToPostId: props.replyTo?.postId ?? null,
})
```

- [ ] **Step 3: Show reply context in composer UI**

```vue
<div v-if="replyTo" class="text-gray-400 text-xs mb-2">
  Replying to {{ replyTo.username ? '@' + replyTo.username : replyTo.author.slice(0, 12) + '…' }}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/post/PostComposer.vue
git commit -m "feat: PostComposer accepts replyTo prop"
```

---

## Task 2: PostCard Reply Context + Thread Link

- [ ] **Step 1: Show "Replying to" header on reply posts**

```vue
<div v-if="post.is_reply" class="text-gray-400 text-xs mb-1">
  Replying to
  <router-link :to="`/profile/${post.reply_to_author}`" class="text-blue-500 hover:underline">
    {{ resolvedReplyUsername ?? post.reply_to_author?.slice(0, 12) + '…' }}
  </router-link>
</div>
```

- [ ] **Step 2: Link post card to thread view**

```vue
<router-link :to="`/thread/${post.author}/${post.post_id}`" class="block hover:bg-gray-50">
  <!-- post content -->
</router-link>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/feed/PostCard.vue
git commit -m "feat: PostCard shows reply context and links to thread view"
```

---

## Task 3: PostThreadView Component

- [ ] **Step 1: Add route to router.js**

```javascript
{ path: '/thread/:address/:postId', component: () => import('./components/post/PostThreadView.vue') },
```

- [ ] **Step 2: Create src/components/post/PostThreadView.vue**

```vue
<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPost, getReplies, getUser } from '../../db/queries.js'
import PostCard from '../feed/PostCard.vue'
import PostSkeleton from '../feed/PostSkeleton.vue'
import PostComposer from './PostComposer.vue'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'

const route  = useRoute()
const auth   = useAuthStore()
const ui     = useUiStore()

const parent  = ref(null)
const replies = ref([])
const loading = ref(false)
const composerOpen = ref(false)

async function load() {
  const { address, postId } = route.params
  loading.value = true
  try {
    parent.value  = await getPost(address, postId)
    const raw     = await getReplies(address, postId)
    replies.value = raw.sort((a, b) => a.block_height - b.block_height || a.tx_index - b.tx_index)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => route.params, load)
</script>

<template>
  <div>
    <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
      <button @click="$router.back()" class="text-gray-500">←</button>
      <span class="font-bold">Thread</span>
    </div>

    <PostSkeleton v-if="loading" />
    <template v-else>
      <PostCard v-if="parent" :post="parent" :highlight="true" />
      <div v-else class="p-8 text-center text-gray-400 text-sm">Post not found or not yet synced.</div>

      <div class="border-t border-gray-100 mt-2">
        <PostCard v-for="reply in replies" :key="reply.post_id" :post="reply" />
        <div v-if="!replies.length && parent" class="p-8 text-center text-gray-400 text-sm">
          No replies yet.
        </div>
      </div>

      <div v-if="auth.isLoggedIn && parent" class="fixed bottom-16 right-4">
        <button @click="composerOpen = true"
          class="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>

      <div v-if="composerOpen"
        class="fixed inset-0 bg-black/30 z-50 flex items-end"
        @click.self="composerOpen = false">
        <div class="bg-white w-full rounded-t-2xl p-4">
          <PostComposer
            :reply-to="parent ? { author: parent.author, postId: parent.post_id } : null"
            @submitted="composerOpen = false; load()"
          />
        </div>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/post/PostThreadView.vue src/router.js
git commit -m "feat: thread view at /thread/:address/:postId"
```

---

## Task 4: Run All Tests + Smoke Test

- [ ] **Step 1: Run all tests**

```bash
npm test
```

- [ ] **Step 2: Smoke test — reply flow**

1. Click on any post card → thread view opens
2. Click reply button → composer opens with "Replying to @username" context
3. Type a short reply (≤23 bytes) → 1 Hub popup (POST_INLINE with is_reply=1)
4. Or type longer reply → N+1 Hub popups (POST_START with is_reply=1 + chunks)
5. After confirmation: reply appears in thread view

- [ ] **Step 3: Smoke test — thread without login**

1. Browse to any post thread without being logged in
2. Parent post and existing replies should be visible (read-only)
3. Reply button not shown (or shows login modal)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: Phase 3 complete — reply composition and thread view"
```

---

## Phase 3 Complete

Reply encoding was already in the protocol from Phase 1. Phase 3 adds:
- Composer reply context (replyTo prop)
- PostCard reply header + thread link
- Thread view at `/thread/:address/:postId`

No likes in V1. Likes are planned for a future phase via a dedicated LIKE_CATALOG_ADDRESS.
