<script setup>
import { computed } from 'vue'
import { useFollow } from '../../composables/useFollow.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'

const props = defineProps({
  user: Object,
  address: String,
})
const auth = useAuthStore()
const ui = useUiStore()
const { active, counts, pending, follow, unfollow } = useFollow(computed(() => props.address))

const isSelf = computed(() => auth.address === props.address)

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
        <p class="nf-mono mt-2 break-all text-[11px] text-[var(--nf-muted)]">{{ address }}</p>
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
