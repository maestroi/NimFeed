<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const walletRuntime = getWalletRuntime()
const open = ref(false)
const root = ref(null)

const primaryLabel = computed(() => auth.displayName || (auth.username ? '@' + auth.username : 'My Account'))
const secondaryLabel = computed(() => auth.username || auth.address?.slice(0, 14) + '…')

function toggleMenu() {
  open.value = !open.value
}

function goToProfile() {
  if (!auth.address) return
  open.value = false
  router.push(`/profile/${encodeURIComponent(auth.address)}`)
}

function logout() {
  open.value = false
  auth.logout()
}

function onDocumentClick(event) {
  if (!root.value) return
  if (!root.value.contains(event.target)) open.value = false
}

function onKeydown(event) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  if (auth.isLoggedIn && !auth.username && !auth.displayName) {
    auth.loadProfile().catch(() => {})
  }
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <button
    v-if="!auth.isLoggedIn"
    class="nq-button light-blue nf-focus nq-blue-bg text-sm text-white"
    :disabled="!walletRuntime.canConnect.value"
    @click="ui.loginModalOpen = true"
  >
    {{ walletRuntime.isNimiqPay.value ? 'Connect Nimiq Pay' : 'Connect Wallet' }}
  </button>
  <div v-else ref="root" class="relative">
    <button
      type="button"
      aria-label="Open wallet menu"
      :aria-expanded="open"
      class="nf-wallet-trigger nf-focus gap-2 rounded-full border border-[var(--nf-border)] bg-white px-2 text-left hover:bg-[var(--nf-soft)]"
      @click.stop="toggleMenu"
    >
      <AddressIdenticon :address="auth.address" img-class="h-7 w-7" />
      <span class="min-w-0">
        <span class="block max-w-[130px] truncate text-xs font-semibold text-[var(--nf-text)]">{{ primaryLabel }}</span>
        <span class="block max-w-[130px] truncate text-[11px] text-[var(--nf-muted)]">{{ secondaryLabel }}</span>
      </span>
      <svg
        class="h-4 w-4 shrink-0 text-[var(--nf-muted)] transition-transform"
        :class="open ? 'rotate-180' : ''"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-40 mt-2 w-40 rounded-xl border border-[var(--nf-border)] bg-white p-1 shadow-lg shadow-[rgba(31,35,72,0.14)]"
    >
      <button
        type="button"
        class="nq-button-s nf-focus min-h-11 w-full justify-start rounded-md px-3 text-left text-sm text-[var(--nf-text)]"
        @click="goToProfile"
      >
        Profile
      </button>
      <button
        type="button"
        class="nf-button-quiet nf-focus min-h-11 w-full justify-start rounded-md px-3 text-left text-sm"
        @click="logout"
      >
        Logout
      </button>
    </div>
  </div>
</template>

<style scoped>
.nf-wallet-trigger {
  display: inline-flex;
  min-height: 44px;
  width: auto;
  align-items: center;
  color: var(--nf-text);
  cursor: pointer;
  transition:
    background-color 0.2s var(--nimiq-ease),
    border-color 0.2s var(--nimiq-ease);
}
</style>
