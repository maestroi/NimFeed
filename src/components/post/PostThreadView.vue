<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PostCard from '../feed/PostCard.vue'
import PostSkeleton from '../feed/PostSkeleton.vue'
import PostComposer from './PostComposer.vue'
import { getPost, getReplies, getUser } from '../../db/queries.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import { useAuthStore } from '../../stores/auth.js'
import { nqToAddressBytes, addressBytesToNq, derivePostAddress } from '../../protocol/address.js'
import { hexToPostIdBytes } from '../../protocol/utils.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import NqDialog from '../common/NqDialog.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const walletRuntime = getWalletRuntime()
const { startDeltaSync, indexer } = useIndexer()

const rootPost = ref(null)
const replies = ref([])
const loading = ref(true)
const composerOpen = ref(false)
const parentUsername = ref(null)

async function loadThread() {
  const address = route.params.address
  const postId = route.params.postId
  loading.value = true
  rootPost.value = null
  replies.value = []
  parentUsername.value = null

  try {
    await startDeltaSync()
    rootPost.value = await getPost(address, postId)

    if (rootPost.value?.author) {
      const u = await getUser(rootPost.value.author)
      parentUsername.value = u?.username ?? null
    }

    if (rootPost.value?.status === 'pending' && rootPost.value.total_chunks) {
      const authorBytes = nqToAddressBytes(address)
      const postIdBytes = hexToPostIdBytes(postId)
      const derived = await derivePostAddress(authorBytes, postIdBytes)
      const derivedNq = addressBytesToNq(derived)
      await indexer.syncDerivedAddress(derivedNq)
      rootPost.value = await getPost(address, postId)
      if (rootPost.value?.author) {
        const u = await getUser(rootPost.value.author)
        parentUsername.value = u?.username ?? null
      }
    }

    let repl = await getReplies(address, postId)
    repl = repl.sort((a, b) => a.block_height - b.block_height || a.tx_index - b.tx_index)
    replies.value = repl
  } finally {
    loading.value = false
  }
}

watch(
  () => [route.params.address, route.params.postId],
  () => loadThread(),
  { immediate: true },
)

function openReplyComposer() {
  if (!auth.isLoggedIn) return
  composerOpen.value = true
}
</script>

<template>
  <section>
    <header class="sticky top-0 z-20 border-b nf-divider bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <button type="button" class="nf-focus text-sm font-semibold text-[var(--nf-primary)]" @click="router.back()">
        ← Back
      </button>
      <p class="nq-label mt-2 !m-0 text-[var(--nf-muted)]">Thread</p>
    </header>

    <div v-if="loading" class="space-y-3 px-4 pt-4 sm:px-6">
      <PostSkeleton />
    </div>

    <template v-else>
      <div class="space-y-3 px-4 pt-4 sm:px-6">
        <PostCard
          v-if="rootPost"
          :post="rootPost"
          flat
          highlight
        />
        <div v-else class="rounded-xl border border-dashed border-[var(--nf-border)] p-8 text-center text-sm text-[var(--nf-muted)]">
          Post not found or not yet synced.
        </div>
      </div>

      <div class="mt-2 border-t nf-divider px-4 pb-28 pt-4 sm:px-6">
        <PostCard
          v-for="r in replies"
          :key="r.post_id + r.author"
          :post="r"
          :tip-height="0"
        />
        <div
          v-if="rootPost && !replies.length"
          class="rounded-xl border border-dashed border-[var(--nf-border)] p-8 text-center text-sm text-[var(--nf-muted)]"
        >
          No replies yet.
        </div>
      </div>

      <div
        v-if="auth.isLoggedIn && rootPost && walletRuntime.canWriteBinaryTransactions.value"
        class="fixed bottom-24 right-5 z-40 sm:bottom-28"
      >
        <button
          type="button"
          class="nf-focus nf-press flex h-14 w-14 items-center justify-center rounded-full nq-blue-bg text-white shadow-lg ring-1 ring-black/10 hover:opacity-95"
          aria-label="Reply to thread"
          @click="openReplyComposer"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <NqDialog
        :open="composerOpen && !!rootPost"
        title="Reply"
        panel-class="nf-dialog-wide"
        @close="composerOpen = false"
      >
        <PostComposer
          v-if="rootPost"
          :reply-to="{
            author: rootPost.author,
            postId: rootPost.post_id,
            username: parentUsername,
          }"
          @submitted="composerOpen = false; loadThread()"
        />
      </NqDialog>
    </template>
  </section>
</template>
