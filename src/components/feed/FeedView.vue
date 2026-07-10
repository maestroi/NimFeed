<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useFeed } from '../../composables/useFeed.js'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import PostCard from './PostCard.vue'
import PostSkeleton from './PostSkeleton.vue'

const ui = useUiStore()
const auth = useAuthStore()
const walletRuntime = getWalletRuntime()
const { indexer } = useIndexer()
const tipHeight = ref(0)
const telegramBotUrl = 'https://t.me/nimiq_notifier_bot'
const aceStakingUrl = 'https://acestaking.com/'
const PULL_THRESHOLD = 64

const globalFeed = useFeed('global')
const followingFeed = useFeed('following')
const globalPosts = globalFeed.posts
const globalLoading = globalFeed.loading
const globalHasMore = globalFeed.hasMore
const followingPosts = followingFeed.posts
const followingLoading = followingFeed.loading
const followingHasMore = followingFeed.hasMore

const rootRef = ref(null)
const sentinelRef = ref(null)
const loadingMoreLock = ref(false)
const pullIndicatorRef = ref(null)
const pullArrowRef = ref(null)
const pullLabelRef = ref(null)
const pullContentRef = ref(null)
const syncDetailsOpen = ref(false)
const syncStatus = ref({
  phase: 'syncing',
  error: null,
  rpcEndpoint: '',
  postCatalog: '',
  catalogFullySynced: false,
  postCount: 0,
  refCount: 0,
  lastSyncedAt: null,
})

let scrollEl = null
let loadMoreObserver = null
let touchStartY = 0
let touchActive = false
let currentPull = 0
let pullRafId = 0
let pendingPull = 0

function current() {
  return ui.activeTab === 'following' ? followingFeed : globalFeed
}

const feedLoading = computed(() =>
  ui.activeTab === 'following' ? followingLoading.value : globalLoading.value,
)
const syncStatusLabel = computed(() => {
  if (syncStatus.value.phase === 'error') return 'Sync failed · Retry'
  if (syncStatus.value.phase === 'syncing') return 'Syncing history…'
  return 'Up to date'
})
const syncStatusClass = computed(() => {
  if (syncStatus.value.phase === 'error') return 'nq-panel error'
  if (syncStatus.value.phase === 'syncing') {
    return 'nq-panel warning'
  }
  return 'nq-panel success'
})
const showSyncBar = computed(() => syncStatus.value.phase === 'syncing' || syncStatus.value.phase === 'error')

function isAtScrollTop() {
  return scrollEl && scrollEl.scrollTop <= 2
}

function switchTab(tab) {
  if (tab === ui.activeTab) return
  ui.activeTab = tab
}

function applyPullVisual(distance) {
  currentPull = distance
  const indicator = pullIndicatorRef.value
  const arrow = pullArrowRef.value
  const label = pullLabelRef.value
  const content = pullContentRef.value
  if (!indicator) return

  if (distance <= 0) {
    indicator.style.height = '0px'
    indicator.style.opacity = '0'
    if (content) content.style.transform = ''
    return
  }

  indicator.style.height = `${distance}px`
  indicator.style.opacity = '1'
  if (arrow) {
    arrow.style.transform = `rotate(${Math.min(distance / PULL_THRESHOLD, 1) * 180}deg)`
  }
  if (label) {
    label.textContent = distance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'
  }
  if (content) content.style.transform = `translate3d(0, ${distance}px, 0)`
}

function queuePullVisual(distance) {
  pendingPull = distance
  if (pullRafId) return
  pullRafId = requestAnimationFrame(() => {
    pullRafId = 0
    applyPullVisual(pendingPull)
  })
}

function resetPull() {
  touchActive = false
  queuePullVisual(0)
}

function pullDistanceFromDelta(delta) {
  return Math.min(delta * 0.7, 96)
}

async function onPullRelease() {
  const pulled = currentPull
  if (pulled < PULL_THRESHOLD || feedLoading.value) {
    resetPull()
    return
  }
  applyPullVisual(PULL_THRESHOLD)
  try {
    await current().refresh()
  } finally {
    applyPullVisual(0)
  }
}

function onTouchStart(event) {
  if (!scrollEl || !isAtScrollTop() || feedLoading.value) return
  touchStartY = event.touches[0].clientY
  touchActive = true
}

function onTouchMove(event) {
  if (!touchActive || !scrollEl) {
    return
  }
  if (!isAtScrollTop()) {
    resetPull()
    return
  }
  const delta = event.touches[0].clientY - touchStartY
  if (delta <= 0) {
    queuePullVisual(0)
    return
  }
  queuePullVisual(pullDistanceFromDelta(delta))
  if (delta > 6) event.preventDefault()
}

function onTouchEnd() {
  if (!touchActive) return
  touchActive = false
  void onPullRelease()
}

function onSyncStatus(event) {
  syncStatus.value = event.detail
}

async function loadSyncStatus() {
  syncStatus.value = await indexer.getPublicSyncStatus()
}

function handleSyncStatusClick() {
  syncDetailsOpen.value = !syncDetailsOpen.value
}

function retrySync() {
  void current().refresh()
}

onMounted(() => {
  void loadSyncStatus()
  current().refresh()
  indexer.addEventListener('catalog:updated', onCatalogUpdated)
  indexer.addEventListener('sync:status', onSyncStatus)
  scrollEl = rootRef.value?.closest('main') ?? null
  if (scrollEl) {
    const capture = { capture: true }
    scrollEl.addEventListener('touchstart', onTouchStart, { ...capture, passive: true })
    scrollEl.addEventListener('touchmove', onTouchMove, { ...capture, passive: false })
    scrollEl.addEventListener('touchend', onTouchEnd, capture)
    scrollEl.addEventListener('touchcancel', onTouchEnd, capture)
  }

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void maybeLoadMore()
    },
    { root: scrollEl, rootMargin: '0px 0px 400px 0px' },
  )
  observeSentinel(sentinelRef.value)
})

onBeforeUnmount(() => {
  if (pullRafId) cancelAnimationFrame(pullRafId)
  loadMoreObserver?.disconnect()
  loadMoreObserver = null
  indexer.removeEventListener('catalog:updated', onCatalogUpdated)
  indexer.removeEventListener('sync:status', onSyncStatus)
  if (scrollEl) {
    const capture = { capture: true }
    scrollEl.removeEventListener('touchstart', onTouchStart, capture)
    scrollEl.removeEventListener('touchmove', onTouchMove, capture)
    scrollEl.removeEventListener('touchend', onTouchEnd, capture)
    scrollEl.removeEventListener('touchcancel', onTouchEnd, capture)
  }
})

watch(
  () => ui.activeTab,
  () => {
    resetPull()
    current().refresh()
  },
)

function onCatalogUpdated() {
  current().reload()
}

async function maybeLoadMore() {
  const feed = current()
  if (!feed.hasMore.value || feed.loading.value || loadingMoreLock.value) return
  loadingMoreLock.value = true
  try {
    await feed.loadPage()
  } finally {
    loadingMoreLock.value = false
  }
}

function observeSentinel(el) {
  if (!loadMoreObserver) return
  if (el) loadMoreObserver.observe(el)
}

watch(sentinelRef, (el, oldEl) => {
  if (oldEl && loadMoreObserver) loadMoreObserver.unobserve(oldEl)
  observeSentinel(el)
})
</script>

<template>
  <div ref="rootRef" class="pb-4">
    <div
      ref="pullIndicatorRef"
      class="nf-pull-indicator flex items-end justify-center gap-2 overflow-hidden text-xs font-semibold text-[var(--nf-primary)]"
      style="height: 0; opacity: 0"
      aria-live="polite"
    >
      <svg ref="pullArrowRef" viewBox="0 0 24 24" class="h-4 w-4 shrink-0" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4a1 1 0 0 1 1 1v9.17l2.59-2.58a1 1 0 1 1 1.42 1.42l-4.3 4.29a1 1 0 0 1-1.42 0l-4.3-4.29a1 1 0 1 1 1.42-1.42L11 14.17V5a1 1 0 0 1 1-1z"
        />
      </svg>
      <span ref="pullLabelRef">Pull to refresh</span>
    </div>

    <div ref="pullContentRef" class="nf-pull-content">
    <header class="sticky top-0 z-20 relative border-b nf-divider bg-white/95 backdrop-blur">
      <div
        v-if="feedLoading"
        class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
        aria-hidden="true"
      >
        <div
          class="nf-refresh-indeterminate h-full w-1/3 rounded-full"
          style="background: linear-gradient(90deg, transparent, var(--nf-primary), var(--nf-gold), transparent)"
        />
      </div>

      <div class="px-4 py-3 sm:px-6">
        <div>
          <p class="nq-label !m-0 text-[var(--nf-primary)]">Nimiq Social</p>
          <h1 class="nq-h2 !m-0 text-[var(--nf-text)]">NimFeed</h1>
        </div>

        <div class="mt-3 flex items-center gap-2">
          <div class="nf-segmented-control flex h-9 items-center rounded-full bg-[var(--text-6)] p-1" role="group" aria-label="Feed view">
          <button
            type="button"
            class="nf-focus h-7 rounded-full px-3 text-xs font-semibold"
            :class="ui.activeTab === 'global' ? 'nq-light-blue-bg text-white' : 'text-[var(--nf-muted)] hover:text-[var(--nf-text)]'"
            :aria-pressed="ui.activeTab === 'global'"
            @click="switchTab('global')"
          >
            Global
          </button>
          <button
            type="button"
            class="nf-focus h-7 rounded-full px-3 text-xs font-semibold"
            :class="ui.activeTab === 'following' ? 'nq-light-blue-bg text-white' : 'text-[var(--nf-muted)] hover:text-[var(--nf-text)]'"
            :aria-pressed="ui.activeTab === 'following'"
            @click="auth.isLoggedIn ? switchTab('following') : (ui.loginModalOpen = true)"
          >
            Following
          </button>
          </div>
          <div class="ml-auto flex flex-col items-end gap-1">
            <button
              v-if="!showSyncBar"
              type="button"
              class="nf-focus rounded-full p-0.5 nf-success-text hover:opacity-80"
              :class="syncDetailsOpen ? 'opacity-100' : 'opacity-70'"
              title="Up to date"
              aria-label="Up to date"
              @click="handleSyncStatusClick"
            >
              <svg viewBox="0 0 20 20" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4L8.5 12l6.8-6.8a1 1 0 0 1 1.4 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <button
              type="button"
              class="nf-focus nf-press inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--nf-primary)] hover:text-[var(--nf-primary-strong)] disabled:opacity-70"
              :disabled="feedLoading"
              :aria-busy="feedLoading"
              @click="current().refresh()"
            >
              <svg
                v-if="feedLoading"
                viewBox="0 0 24 24"
                class="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-dasharray="42"
                  stroke-dashoffset="12"
                />
              </svg>
              {{ feedLoading ? 'Refreshing…' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="!walletRuntime.isNimiqPay.value" class="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5">
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
            class="nf-focus inline-flex items-center gap-1.5 rounded-full border nf-gold-chip px-3 py-1 text-[11px] font-semibold hover:bg-white"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path
                d="M12 2a8 8 0 0 0-8 8c0 4.2 3 7.7 7 8.7V22h2v-3.3c4-1 7-4.5 7-8.7a8 8 0 0 0-8-8zm-1 12.9L7.6 11.5l1.4-1.4L11 12l4-4 1.4 1.4-5.4 5.5z"
              />
            </svg>
            Stake with AceStaking
          </a>
        </div>

        <button
          v-if="showSyncBar"
          type="button"
          class="nf-focus nq-panel mt-2 flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold"
          :class="syncStatusClass"
          :aria-expanded="syncDetailsOpen"
          @click="handleSyncStatusClick"
        >
          <svg
            v-if="syncStatus.phase === 'syncing'"
            viewBox="0 0 24 24"
            class="h-4 w-4 shrink-0 animate-spin"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-dasharray="42"
              stroke-dashoffset="12"
            />
          </svg>
          <span
            v-else
            class="h-2.5 w-2.5 shrink-0 rounded-full bg-current"
            aria-hidden="true"
          />
          <span role="status" aria-live="polite">{{ syncStatusLabel }}</span>
          <span class="ml-auto font-normal opacity-80">{{ syncStatus.postCount }} posts indexed</span>
        </button>

        <div
          v-if="syncDetailsOpen"
          class="nq-panel mt-2 space-y-1.5 p-3 text-[11px] text-[var(--nf-muted)]"
        >
          <p class="font-semibold text-[var(--nf-text)]">Public sync details</p>
          <p>History: {{ syncStatus.catalogFullySynced ? 'fully indexed' : 'still backfilling' }}</p>
          <p>Local data: {{ syncStatus.postCount }} posts · {{ syncStatus.refCount }} references</p>
          <p class="nf-mono break-all">RPC: {{ syncStatus.rpcEndpoint }}</p>
          <p class="nf-mono break-all">Catalog: {{ syncStatus.postCatalog }}</p>
          <p v-if="syncStatus.error" class="nf-danger-text" role="alert">Error: {{ syncStatus.error }}</p>
          <button
            v-if="syncStatus.phase === 'error'"
            type="button"
            class="nf-focus mt-2 min-h-11 nq-button light-blue px-4 py-2 text-xs font-semibold disabled:opacity-50"
            @click="retrySync"
          >
            Retry sync
          </button>
        </div>
      </div>
    </header>

    <div
      v-if="feedLoading"
      class="flex items-center justify-center gap-2 border-b nf-divider bg-[var(--nf-soft)] px-4 py-2.5 text-xs font-semibold text-[var(--nf-primary)]"
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4 animate-spin" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-dasharray="42"
          stroke-dashoffset="12"
        />
      </svg>
      Syncing latest posts…
    </div>

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
        <div v-if="globalHasMore" ref="sentinelRef" class="px-4 py-5 text-center text-sm text-[var(--nf-muted)] sm:px-6">
          {{ globalLoading ? 'Loading…' : '' }}
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
        <div v-if="followingHasMore" ref="sentinelRef" class="px-4 py-5 text-center text-sm text-[var(--nf-muted)] sm:px-6">
          {{ followingLoading ? 'Loading…' : '' }}
        </div>
      </template>
    </template>
    </div>
  </div>
</template>
