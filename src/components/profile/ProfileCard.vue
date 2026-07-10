<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFollow } from '../../composables/useFollow.js'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { EXPLORER_BASE_URL } from '../../protocol/constants.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import { normalizeUsername } from '../../protocol/utils.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'
import LinkifiedText from '../common/LinkifiedText.vue'

const props = defineProps({
  user: Object,
  address: String,
  savingProfile: { type: Boolean, default: false },
})
const emit = defineEmits(['save-profile'])

const auth = useAuthStore()
const ui = useUiStore()
const walletRuntime = getWalletRuntime()
const { active, counts, pending, follow, unfollow } = useFollow(computed(() => props.address))

const router = useRouter()
const isSelf = computed(() => auth.address === props.address)

function logout() {
  auth.logout()
  router.push('/')
}
const accountExplorerUrl = computed(() =>
  props.address ? `${EXPLORER_BASE_URL}/account/${encodeURIComponent(props.address)}` : null,
)
const telegramBotUrl = 'https://t.me/nimiq_notifier_bot'

const editing = ref(false)
const editUsername = ref('')
const editDisplayName = ref('')
const editError = ref(null)

function startEdit() {
  editUsername.value = props.user?.username ?? ''
  editDisplayName.value = props.user?.display_name ?? ''
  editError.value = null
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  editError.value = null
}

function saveEdit() {
  editError.value = null
  const uname = normalizeUsername(editUsername.value.trim())
  if (!uname) {
    editError.value = 'Choose a valid username (3–31 lowercase letters, digits, underscore).'
    return
  }
  emit('save-profile', {
    username: uname,
    displayName: editDisplayName.value.trim(),
    onSuccess: () => { editing.value = false },
    onError: (msg) => { editError.value = msg },
  })
}

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

        <div class="flex gap-2">
          <button
            v-if="isSelf && walletRuntime.canPublishPosts.value && !editing"
            type="button"
            class="nf-focus nf-press rounded-full border border-[var(--nf-border)] px-4 py-2 text-sm font-semibold text-[var(--nf-text)] hover:bg-[var(--nf-soft)]"
            @click="startEdit"
          >
            Edit profile
          </button>
          <button
            v-if="!isSelf && walletRuntime.canPublishPosts.value"
            type="button"
            :disabled="pending"
            :class="[
              'nf-focus nf-press rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50',
              active
                ? 'border border-[var(--nf-border)] text-[var(--nf-muted)] hover:text-[var(--nf-red)]'
                : 'nq-blue-bg text-white',
            ]"
            @click="handleFollowClick"
          >
            {{ pending ? '…' : active ? 'Following' : 'Follow' }}
          </button>
        </div>
      </div>

      <div v-if="editing" class="mt-4 space-y-3">
        <div>
          <label for="profile-username" class="mb-1 block text-[11px] font-semibold text-[var(--nf-muted)]">Username</label>
          <input
            id="profile-username"
            v-model="editUsername"
            type="text"
            class="nf-focus nf-input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="username"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div>
          <label for="profile-display-name" class="mb-1 block text-[11px] font-semibold text-[var(--nf-muted)]">Display name</label>
          <input
            id="profile-display-name"
            v-model="editDisplayName"
            type="text"
            class="nf-focus nf-input w-full rounded-lg px-3 py-2 text-sm"
            placeholder="Display name (optional)"
          />
        </div>
        <p v-if="editError" class="text-xs nf-danger-text" role="alert">{{ editError }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="nf-focus nf-press rounded-full nq-blue-bg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            :disabled="savingProfile"
            @click="saveEdit"
          >
            {{ savingProfile ? 'Saving…' : 'Save' }}
          </button>
          <button
            type="button"
            class="nf-focus rounded-full border border-[var(--nf-border)] px-4 py-2 text-xs font-semibold text-[var(--nf-muted)] hover:text-[var(--nf-text)]"
            :disabled="savingProfile"
            @click="cancelEdit"
          >
            Cancel
          </button>
        </div>
      </div>

      <div v-else class="mt-3">
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
        <p v-if="user?.bio" class="nq-text mt-3 whitespace-pre-wrap break-words">
          <LinkifiedText :text="user.bio" />
        </p>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <div class="rounded-lg border border-[var(--nf-border)] px-3 py-2">
          <p class="nq-label text-[var(--nf-muted)]">Following</p>
          <p class="text-base font-bold text-[var(--nf-text)]">{{ counts.following }}</p>
        </div>
        <div class="rounded-lg border border-[var(--nf-border)] px-3 py-2">
          <p class="nq-label text-[var(--nf-muted)]">Followers</p>
          <p class="text-base font-bold text-[var(--nf-text)]">{{ counts.followers }}</p>
        </div>
        <button
          v-if="isSelf"
          type="button"
          class="nf-focus ml-auto rounded-full border border-[var(--nf-border)] px-4 py-2 text-xs font-semibold text-[var(--nf-muted)] hover:border-[rgba(217,68,50,0.3)] hover:text-[var(--nf-red)]"
          @click="logout"
        >
          Log out
        </button>
      </div>
    </section>
  </div>
</template>
