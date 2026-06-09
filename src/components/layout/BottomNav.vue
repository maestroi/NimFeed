<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import { shellClasses } from '../../chain/miniAppLayout.js'

const router = useRouter()
const route = useRoute()
const ui = useUiStore()
const auth = useAuthStore()
const walletRuntime = getWalletRuntime()

function openComposerFresh() {
  if (!auth.isLoggedIn) {
    ui.loginModalOpen = true
    return
  }
  ui.composerReplyTo = null
  ui.composerOpen = true
}
</script>

<template>
  <nav :class="shellClasses(walletRuntime.isNimiqPay.value).nav">
    <div :class="shellClasses(walletRuntime.isNimiqPay.value).navInner">
      <div class="grid grid-cols-4 items-center gap-2">
        <button
          type="button"
          :class="route.path === '/' ? 'text-[var(--nf-primary)]' : 'text-[var(--nf-muted)]'"
          class="nf-focus nf-press rounded-xl py-2 flex flex-col items-center gap-1"
          @click="router.push('/')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5.5 10.5V20h13V10.5" />
          </svg>
          <span class="text-[11px] font-semibold">Home</span>
        </button>

        <button
          type="button"
          :class="route.path === '/search' ? 'text-[var(--nf-primary)]' : 'text-[var(--nf-muted)]'"
          class="nf-focus nf-press rounded-xl py-2 flex flex-col items-center gap-1"
          @click="router.push('/search')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7.2" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span class="text-[11px] font-semibold">Search</span>
        </button>

        <button
          type="button"
          class="nf-focus nf-press mx-auto h-12 w-12 rounded-full nq-gold-bg text-white flex items-center justify-center shadow-lg shadow-[rgba(236,153,28,0.35)]"
          @click="openComposerFresh"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button
          type="button"
          :class="route.path.startsWith('/profile') ? 'text-[var(--nf-primary)]' : 'text-[var(--nf-muted)]'"
          class="nf-focus nf-press rounded-xl py-2 flex flex-col items-center gap-1"
          @click="auth.isLoggedIn ? router.push(`/profile/${auth.address}`) : (ui.loginModalOpen = true)"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.2-4 4.2-6 8-6s6.8 2 8 6" />
          </svg>
          <span class="text-[11px] font-semibold">Profile</span>
        </button>
      </div>
    </div>
  </nav>
</template>
