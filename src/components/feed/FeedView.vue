<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useFeed } from '../../composables/useFeed.js'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import PostCard from './PostCard.vue'
import PostSkeleton from './PostSkeleton.vue'
import WalletButton from '../auth/WalletButton.vue'

const ui = useUiStore()
const auth = useAuthStore()
const { indexer } = useIndexer()
const tipHeight = ref(0)

const globalFeed = useFeed('global')
const followingFeed = useFeed('following')
const globalPosts = globalFeed.posts
const globalLoading = globalFeed.loading
const globalHasMore = globalFeed.hasMore
const followingPosts = followingFeed.posts
const followingLoading = followingFeed.loading
const followingHasMore = followingFeed.hasMore

function current() {
  return ui.activeTab === 'following' ? followingFeed : globalFeed
}

function switchTab(tab) {
  if (tab === ui.activeTab) return
  ui.activeTab = tab
}

onMounted(() => {
  current().refresh()
  indexer.addEventListener('catalog:updated', onCatalogUpdated)
})

onBeforeUnmount(() => {
  indexer.removeEventListener('catalog:updated', onCatalogUpdated)
})

watch(
  () => ui.activeTab,
  () => {
    current().refresh()
  },
)

function onCatalogUpdated() {
  current().reload()
}
</script>

<template>
  <div class="pb-4">
    <header class="sticky top-0 z-20 border-b nf-divider bg-white/90 backdrop-blur">
      <div class="px-4 py-3 sm:px-6">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="nq-label !m-0 text-[var(--nf-muted)]">Nimiq Social</p>
            <h1 class="nq-h2 !m-0 text-[var(--nf-text)]">NimFeed</h1>
          </div>
          <WalletButton />
        </div>

        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="nf-focus nf-press rounded-full border px-3 py-1.5 text-xs font-semibold"
            :class="ui.activeTab === 'global' ? 'border-transparent nq-blue-bg text-white' : 'border-[var(--nf-border)] text-[var(--nf-muted)]'"
            @click="switchTab('global')"
          >
            Home
          </button>
          <button
            type="button"
            class="nf-focus nf-press rounded-full border px-3 py-1.5 text-xs font-semibold"
            :class="ui.activeTab === 'following' ? 'border-transparent nq-blue-bg text-white' : 'border-[var(--nf-border)] text-[var(--nf-muted)]'"
            @click="auth.isLoggedIn ? switchTab('following') : (ui.loginModalOpen = true)"
          >
            Following
          </button>
          <button
            type="button"
            class="nf-focus ml-auto text-xs font-semibold text-[var(--nf-primary)] hover:text-[var(--nf-primary-strong)]"
            @click="current().refresh()"
          >
            Refresh
          </button>
        </div>
      </div>
    </header>

    <template v-if="ui.activeTab === 'global'">
      <div v-if="globalLoading && !globalPosts.length" class="px-4 pt-4 sm:px-6 space-y-3">
        <PostSkeleton v-for="i in 5" :key="i" />
      </div>
      <template v-else>
        <div class="px-4 pt-4 sm:px-6 space-y-3">
          <template v-for="post in globalPosts" :key="post.post_id + post.author">
            <PostSkeleton v-if="post._skeleton" />
            <PostCard v-else :post="post" :tip-height="tipHeight" />
          </template>
        </div>
        <div v-if="globalHasMore" class="px-4 py-5 text-center sm:px-6">
          <button
            type="button"
            class="nf-focus nf-press rounded-full border border-[var(--nf-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--nf-primary)] disabled:opacity-50"
            :disabled="globalLoading"
            @click="globalFeed.loadPage"
          >
            {{ globalLoading ? 'Loading…' : 'Load more posts' }}
          </button>
        </div>
        <div v-else class="px-4 py-8 text-center text-sm text-[var(--nf-muted)]">You reached the first indexed posts.</div>
      </template>
    </template>

    <template v-else-if="ui.activeTab === 'following'">
      <div v-if="followingLoading && !followingPosts.length" class="px-4 pt-4 sm:px-6 space-y-3">
        <PostSkeleton v-for="i in 5" :key="i" />
      </div>
      <div
        v-else-if="!followingPosts.length && !followingLoading"
        class="px-4 py-12 text-center text-sm text-[var(--nf-muted)]"
      >
        Follow people to build your personal timeline.
      </div>
      <template v-else>
        <div class="px-4 pt-4 sm:px-6 space-y-3">
          <template v-for="post in followingPosts" :key="post.post_id + post.author">
            <PostSkeleton v-if="post._skeleton" />
            <PostCard v-else :post="post" :tip-height="tipHeight" />
          </template>
        </div>
        <div v-if="followingHasMore" class="px-4 py-5 text-center sm:px-6">
          <button
            type="button"
            class="nf-focus nf-press rounded-full border border-[var(--nf-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--nf-primary)] disabled:opacity-50"
            :disabled="followingLoading"
            @click="followingFeed.loadPage"
          >
            {{ followingLoading ? 'Loading…' : 'Load more posts' }}
          </button>
        </div>
      </template>
    </template>
  </div>
</template>
