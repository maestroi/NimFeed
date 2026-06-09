<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useFeed } from '../../composables/useFeed.js'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import PostCard from './PostCard.vue'
import PostSkeleton from './PostSkeleton.vue'

const ui = useUiStore()
const auth = useAuthStore()
const { indexer } = useIndexer()
const tipHeight = ref(0)
const telegramBotUrl = 'https://t.me/nimiq_notifier_bot'
const aceStakingUrl = 'https://acestaking.com/'

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
        <div>
          <p class="nq-label !m-0 text-[var(--nf-muted)]">Nimiq Social</p>
          <h1 class="nq-h2 !m-0 text-[var(--nf-text)]">NimFeed</h1>
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

        <div class="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5">
          <a
            :href="telegramBotUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="nf-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--nf-border)] bg-[var(--nf-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--nf-primary)] hover:bg-white"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path
                d="M20.7 3.3a1.5 1.5 0 0 0-1.5-.2L3 9.6a1.5 1.5 0 0 0 .1 2.8l4.3 1.4 1.5 5a1.5 1.5 0 0 0 2.6.6l2.6-3 4.1 3a1.5 1.5 0 0 0 2.4-.9l2-13.6a1.5 1.5 0 0 0-.8-1.6zm-3.3 4.1-7 6.2a1 1 0 0 0-.3.9l-.3 1.8-1-3.2 8-6.6a.5.5 0 1 1 .6.8z"
              />
            </svg>
            Notify Bot
          </a>
          <a
            :href="aceStakingUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="nf-focus inline-flex items-center gap-1.5 rounded-full border border-[#f2cf7c] bg-[#fff8e7] px-3 py-1 text-[11px] font-semibold text-[#9a6a00] hover:bg-[#fff3d0]"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path
                d="M12 2a8 8 0 0 0-8 8c0 4.2 3 7.7 7 8.7V22h2v-3.3c4-1 7-4.5 7-8.7a8 8 0 0 0-8-8zm-1 12.9L7.6 11.5l1.4-1.4L11 12l4-4 1.4 1.4-5.4 5.5z"
              />
            </svg>
            Stake with AceStaking
          </a>
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
