<script setup>
import { computed } from 'vue'
import { useFollow } from '../../composables/useFollow.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { EXPLORER_BASE_URL } from '../../protocol/constants.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'

const props = defineProps({
  user: Object,
  address: String,
})
const auth = useAuthStore()
const ui = useUiStore()
const { active, counts, pending, follow, unfollow } = useFollow(computed(() => props.address))

const isSelf = computed(() => auth.address === props.address)
const accountExplorerUrl = computed(() =>
  props.address ? `${EXPLORER_BASE_URL}/account/${encodeURIComponent(props.address)}` : null,
)
const telegramBotUrl = 'https://t.me/nimiq_notifier_bot'

function handleFollowClick() {
  if (!auth.isLoggedIn) {
    ui.loginModalOpen = true
    return
  }
  active.value ? unfollow() : follow()
}
</script>

<template>
  <div class="px-4 pt-4 sm:px-6">
    <section class="nf-card p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <AddressIdenticon :address="address" img-class="h-16 w-16" />

        <button
          v-if="!isSelf"
          type="button"
          :disabled="pending"
          :class="[
            'nf-focus nf-press rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50',
            active
              ? 'border border-[var(--nf-border)] text-[var(--nf-muted)] hover:text-rose-600'
              : 'nq-blue-bg text-white',
          ]"
          @click="handleFollowClick"
        >
          {{ pending ? '…' : active ? 'Following' : 'Follow' }}
        </button>
      </div>

      <div class="mt-3">
        <h2 class="nq-h3">{{ user?.display_name ?? 'Anonymous' }}</h2>
        <p v-if="user?.username" class="nq-text-s text-[var(--nf-muted)]">@{{ user.username }}</p>
        <div class="mt-2 flex items-center gap-2">
          <p class="nf-mono break-all text-[11px] text-[var(--nf-muted)]">{{ address }}</p>
          <a
            v-if="accountExplorerUrl"
            :href="accountExplorerUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="nf-focus shrink-0 rounded-md p-1 text-[var(--nf-primary)] hover:bg-[var(--nf-soft)]"
            title="Open account on NimiqScan"
            aria-label="Open account on NimiqScan"
          >
            <svg viewBox="0 0 20 20" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path
                d="M3.5 3.5h5a1 1 0 1 1 0 2h-3.29l6.9 6.9a1 1 0 0 1-1.42 1.4l-6.89-6.89V10.2a1 1 0 1 1-2 0V4.5a1 1 0 0 1 1-1zm7 1a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V6.91l-6.9 6.9a1 1 0 0 1-1.4-1.42l6.89-6.89H11.5a1 1 0 0 1-1-1z"
              />
            </svg>
          </a>
          <a
            :href="telegramBotUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="nf-focus shrink-0 rounded-md p-1 text-[var(--nf-primary)] hover:bg-[var(--nf-soft)]"
            title="Open @nimiq_notifier_bot on Telegram"
            aria-label="Open @nimiq_notifier_bot on Telegram"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path
                d="M20.7 3.3a1.5 1.5 0 0 0-1.5-.2L3 9.6a1.5 1.5 0 0 0 .1 2.8l4.3 1.4 1.5 5a1.5 1.5 0 0 0 2.6.6l2.6-3 4.1 3a1.5 1.5 0 0 0 2.4-.9l2-13.6a1.5 1.5 0 0 0-.8-1.6zm-3.3 4.1-7 6.2a1 1 0 0 0-.3.9l-.3 1.8-1-3.2 8-6.6a.5.5 0 1 1 .6.8z"
              />
            </svg>
          </a>
        </div>
        <p v-if="user?.bio" class="nq-text mt-3">{{ user.bio }}</p>
      </div>

      <div class="mt-4 flex gap-3">
        <div class="rounded-lg border border-[var(--nf-border)] px-3 py-2">
          <p class="nq-label text-[var(--nf-muted)]">Following</p>
          <p class="text-base font-bold text-[var(--nf-text)]">{{ counts.following }}</p>
        </div>
        <div class="rounded-lg border border-[var(--nf-border)] px-3 py-2">
          <p class="nq-label text-[var(--nf-muted)]">Followers</p>
          <p class="text-base font-bold text-[var(--nf-text)]">{{ counts.followers }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
