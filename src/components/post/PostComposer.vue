<script setup>
import { ref, watch, computed } from 'vue'
import { usePost } from '../../composables/usePost.js'
import { useAuthStore } from '../../stores/auth.js'
import { MAX_POST_CHARS } from '../../protocol/constants.js'
import { useUiStore } from '../../stores/ui.js'
import { storeToRefs } from 'pinia'
import AddressIdenticon from '../common/AddressIdenticon.vue'
import { getWalletRuntime } from '../../chain/walletRuntime.js'

const props = defineProps({
  /** When set, reply context comes from the prop (e.g. thread modal). Shape matches store fallback via {@link effectiveReply}. */
  replyTo: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['submitted'])

const auth = useAuthStore()
const ui = useUiStore()
const walletRuntime = getWalletRuntime()
const { composerReplyTo } = storeToRefs(ui)
const {
  submitPost,
  sending,
  error,
  signingActive,
  signingStep,
  signingTotal,
  signingLabel,
  hasPendingChunkUpload,
  pendingChunkRemaining,
  cancelPendingChunkUpload,
} = usePost()
const text = ref('')
const charCount = ref(0)
const popupBlocked = computed(() => String(error.value || '').toLowerCase().includes('popup blocked'))

const effectiveReply = computed(() => {
  const p = props.replyTo
  if (p?.author != null && p?.postId != null) {
    return {
      author: p.author,
      postId: p.postId,
      username: p.username ?? null,
    }
  }
  const r = composerReplyTo.value
  if (r?.author && r?.post_id) {
    return { author: r.author, postId: r.post_id, username: null }
  }
  return null
})

watch(composerReplyTo, () => {
  if (!composerReplyTo.value || props.replyTo) return
  text.value = ''
  charCount.value = 0
})

watch(
  () => props.replyTo && `${props.replyTo.author}:${props.replyTo.postId}`,
  () => {
    if (!props.replyTo) return
    text.value = ''
    charCount.value = 0
  },
)

function onInput(e) {
  text.value = e.target.value
  charCount.value = text.value.length
}

async function post() {
  if (!text.value.trim() || sending.value) return
  const er = effectiveReply.value
  const replyToAuthor = er?.author ?? null
  const replyToPostId = er?.postId ?? null
  try {
    await submitPost(text.value.trim(), { replyToAuthor, replyToPostId })
    text.value = ''
    charCount.value = 0
    emit('submitted')
    if (!props.replyTo) {
      ui.composerReplyTo = null
      ui.composerOpen = false
    }
  } catch {
    /* surfaced via composable */
  }
}

function cancelPending() {
  cancelPendingChunkUpload()
}
</script>

<template>
  <div class="p-4 sm:p-5">
    <div
      v-if="effectiveReply"
      class="mb-3 rounded-xl border border-[var(--nf-border)] nf-gradient-chip px-3 py-2 text-xs text-[var(--nf-muted)]"
    >
      Replying to
      {{
        effectiveReply.username
          ? '@' + effectiveReply.username
          : effectiveReply.author.slice(0, 12) + '…'
      }}
    </div>

    <div class="flex gap-3">
      <AddressIdenticon :address="auth.address" img-class="h-10 w-10" />

      <div class="flex-1">
        <textarea
          :value="text"
          :maxlength="MAX_POST_CHARS"
          rows="4"
          placeholder="What should the network remember?"
          class="nf-focus w-full resize-none rounded-xl border border-[var(--nf-border)] bg-white px-3 py-2 text-sm text-[var(--nf-text)] placeholder:text-[var(--nf-muted)]"
          @input="onInput"
        />

        <div class="mt-3 flex items-center justify-between gap-3">
          <span
            class="text-xs"
            :class="charCount > MAX_POST_CHARS * 0.9 ? 'text-rose-600' : 'text-[var(--nf-muted)]'"
          >
            {{ charCount }}/{{ MAX_POST_CHARS }}
          </span>

          <div class="flex items-center gap-2">
            <span v-if="error && !popupBlocked" class="text-xs text-rose-600">{{ error }}</span>

            <button
              class="nf-focus nf-press rounded-full nq-blue-bg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              :disabled="!text.trim() || sending"
              @click="post"
            >
              {{ sending ? 'Posting…' : hasPendingChunkUpload ? 'Continue signing' : 'Post' }}
            </button>
            <button
              v-if="hasPendingChunkUpload && !sending"
              type="button"
              class="nf-focus text-xs font-semibold text-[var(--nf-muted)] hover:text-rose-600"
              @click="cancelPending"
            >
              Cancel pending upload
            </button>
          </div>
        </div>
        <p v-if="walletRuntime.isNimiqPay.value" class="mt-2 text-xs text-[var(--nf-muted)]">
          Nimiq Pay will ask you to approve each on-chain post transaction.
        </p>

        <p v-if="signingActive" class="mt-2 text-xs text-[var(--nf-muted)]">
          <template v-if="popupBlocked">
            Signing {{ signingStep }}/{{ signingTotal }}. Popup blocked, click Continue signing.
          </template>
          <template v-else>
            Signing {{ signingStep }}/{{ signingTotal }}: {{ signingLabel }}
          </template>
        </p>
        <p v-if="hasPendingChunkUpload && !sending" class="mt-1 text-xs text-[var(--nf-muted)]">
          Pending chunks left: {{ pendingChunkRemaining }}
        </p>
      </div>
    </div>
  </div>
</template>
