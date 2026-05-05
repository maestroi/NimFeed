<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
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
    class="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700"
    @click="ui.loginModalOpen = true"
  >
    Connect Wallet
  </button>
  <div v-else ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-2 rounded-full border border-[var(--nf-border)] bg-white px-2 py-1.5 text-left hover:bg-gray-50"
      @click.stop="toggleMenu"
    >
      <AddressIdenticon :address="auth.address" img-class="h-7 w-7" />
      <span class="min-w-0">
        <span class="block max-w-[130px] truncate text-xs font-semibold text-[var(--nf-text)]">{{ primaryLabel }}</span>
        <span class="block max-w-[130px] truncate text-[11px] text-[var(--nf-muted)]">{{ secondaryLabel }}</span>
      </span>
      <span class="text-xs text-[var(--nf-muted)]">▾</span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-40 mt-2 w-40 rounded-xl border border-[var(--nf-border)] bg-white p-1 shadow-lg"
    >
      <button
        type="button"
        class="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--nf-text)] hover:bg-[var(--nf-soft)]"
        @click="goToProfile"
      >
        Profile
      </button>
      <button
        type="button"
        class="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--nf-text)] hover:bg-[var(--nf-soft)]"
        @click="logout"
      >
        Logout
      </button>
    </div>
  </div>
</template>
