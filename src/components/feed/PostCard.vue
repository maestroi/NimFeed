<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { TENTATIVE_BLOCK_CONFIRMATIONS, EXPLORER_BASE_URL } from '../../protocol/constants.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { getUser } from '../../db/queries.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'
import LinkifiedText from '../common/LinkifiedText.vue'

const props = defineProps({
  post: Object,
  tipHeight: Number,
  flat: { type: Boolean, default: false },
  highlight: { type: Boolean, default: false },
})

const auth = useAuthStore()
const ui = useUiStore()
const walletRuntime = getWalletRuntime()

const threadTo = computed(() => ({
  name: 'thread',
  params: { address: props.post.author, postId: props.post.post_id },
}))

const authorShort = computed(() => props.post.author?.slice(0, 16) + '…')
const authorLabel = ref(null)
const timeLabel = computed(() => `block ${props.post.block_height ?? '…'}`)
const blockUrl = computed(() => {
  const h = props.post.block_height
  if (h == null || h <= 0) return null
  return `${EXPLORER_BASE_URL}/block/${h}`
})
const txUrl = computed(() => {
  if (!props.post.tx_hash) return null
  return `${EXPLORER_BASE_URL}/transaction/${props.post.tx_hash}`
})

const resolvedReplyUsername = ref(null)

watch(
  () => props.post.author,
  async (author) => {
    authorLabel.value = null
    if (!author) return
    const u = await getUser(author)
    authorLabel.value = u?.username ? '@' + u.username : null
  },
  { immediate: true },
)

watch(
  () => [props.post.is_reply, props.post.reply_to_author],
  async ([isReply, replyAuthor]) => {
    resolvedReplyUsername.value = null
    if (!isReply || !replyAuthor) return
    const u = await getUser(replyAuthor)
    resolvedReplyUsername.value = u?.username ?? null
  },
  { immediate: true },
)

function onReply(e) {
  e.stopPropagation()
  if (!auth.isLoggedIn) {
    ui.loginModalOpen = true
    return
  }
  if (props.post._skeleton) return
  ui.composerReplyTo = { author: props.post.author, post_id: props.post.post_id }
  ui.composerOpen = true
}

function onTip(e) {
  e.stopPropagation()
  if (!auth.isLoggedIn) {
    ui.loginModalOpen = true
    return
  }
  if (props.post._skeleton) return
  ui.tipTarget = { address: props.post.author, label: authorLabel.value }
}

const isSelf = computed(() => auth.address === props.post.author)

const showContent = computed(
  () =>
    props.post.status === 'complete' ||
    props.post.status === 'inline',
)

const navigable = computed(() => !props.flat && !props.post._skeleton)

const cardClass = computed(() => [
  'nf-card p-4',
  navigable.value ? 'cursor-pointer nf-press' : '',
  props.highlight ? 'ring-2 ring-[var(--nf-primary)]/25 shadow-sm' : '',
])
</script>

<template>
  <article :class="cardClass">
    <div v-if="post.is_reply && post.reply_to_post_id" class="mb-3 ml-12 text-xs text-[var(--nf-muted)]">
      Replying to
      <RouterLink
        :to="'/profile/' + post.reply_to_author"
        class="font-semibold text-[var(--nf-primary)] hover:underline"
        @click.stop
      >
        {{
          resolvedReplyUsername != null && resolvedReplyUsername !== ''
            ? '@' + resolvedReplyUsername
            : post.reply_to_author?.slice(0, 12) + '…'
        }}
      </RouterLink>
    </div>

    <div class="flex gap-3">
      <RouterLink
        :to="'/profile/' + post.author"
        class="h-10 w-10 shrink-0 overflow-hidden rounded-full"
        tabindex="-1"
        @click.stop
      >
        <AddressIdenticon :address="post.author" img-class="h-10 w-10" />
      </RouterLink>

      <div class="min-w-0 flex-1">
        <RouterLink
          v-if="navigable"
          :to="threadTo"
          custom
          v-slot="{ navigate }"
        >
          <div class="cursor-pointer rounded-lg outline-none" role="link" tabindex="0" @click="navigate" @keydown.enter="navigate">
            <div class="mb-1 flex items-center gap-2">
              <RouterLink
                :to="'/profile/' + post.author"
                class="truncate text-sm font-semibold text-[var(--nf-text)] hover:underline"
                @click.stop
              >
                {{ authorLabel || authorShort }}
              </RouterLink>
              <a
                v-if="blockUrl"
                :href="blockUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-[var(--nf-muted)] hover:underline"
                @click.stop
              >
                {{ timeLabel }}
              </a>
              <span v-else class="text-xs text-[var(--nf-muted)]">{{ timeLabel }}</span>
              <a
                v-if="txUrl"
                :href="txUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs font-semibold text-[var(--nf-primary)] hover:underline"
                @click.stop
              >
                tx
              </a>
              <span
                v-if="tipHeight && post.block_height != null && tipHeight - post.block_height < TENTATIVE_BLOCK_CONFIRMATIONS"
                class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                title="Waiting for confirmations"
              >
                Pending
              </span>
            </div>

            <p
              v-if="showContent"
              class="nq-text whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--nf-text)]"
            >
              <LinkifiedText :text="post.content" />
            </p>
            <p v-else-if="post.status === 'missing_chunks'" class="nq-text-s italic text-[var(--nf-muted)]">
              Post unavailable
            </p>
            <p v-else class="nq-text-s italic text-[var(--nf-muted)]">Loading…</p>
          </div>
        </RouterLink>

        <template v-else>
          <div class="mb-1 flex items-center gap-2">
            <RouterLink
              :to="'/profile/' + post.author"
              class="truncate text-sm font-semibold text-[var(--nf-text)] hover:underline"
              @click.stop
            >
              {{ authorLabel || authorShort }}
            </RouterLink>
            <a
              v-if="blockUrl"
              :href="blockUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-[var(--nf-muted)] hover:underline"
              @click.stop
            >
              {{ timeLabel }}
            </a>
            <span v-else class="text-xs text-[var(--nf-muted)]">{{ timeLabel }}</span>
            <a
              v-if="txUrl"
              :href="txUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs font-semibold text-[var(--nf-primary)] hover:underline"
              @click.stop
            >
              tx
            </a>
            <span
              v-if="tipHeight && post.block_height != null && tipHeight - post.block_height < TENTATIVE_BLOCK_CONFIRMATIONS"
              class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
              title="Waiting for confirmations"
            >
              Pending
            </span>
          </div>

          <p
            v-if="showContent"
            class="nq-text whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[var(--nf-text)]"
          >
            <LinkifiedText :text="post.content" />
          </p>
          <p v-else-if="post.status === 'missing_chunks'" class="nq-text-s italic text-[var(--nf-muted)]">
            Post unavailable
          </p>
          <p v-else class="nq-text-s italic text-[var(--nf-muted)]">Loading…</p>
        </template>

        <div
          v-if="!post._skeleton"
          class="mt-3 flex items-center gap-2"
          @click.stop
        >
          <button
            v-if="walletRuntime.canPublishPosts.value"
            type="button"
            class="nf-focus nq-button-s light-blue"
            @click="onReply"
          >
            Reply
          </button>
          <button
            v-if="!isSelf && walletRuntime.canPublishPosts.value"
            type="button"
            class="nf-focus nq-button-s green"
            @click="onTip"
          >
            Tip
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
