<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { searchUsernames, getUser } from '../../db/queries.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'

const router = useRouter()
const query = ref('')
const results = ref([])
const loading = ref(false)

let debounceTimer
watch(query, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    if (val.length < 2) {
      results.value = []
      return
    }
    loading.value = true
    try {
      const claims = await searchUsernames(val)
      results.value = await Promise.all(
        claims.map(async (claim) => {
          const user = await getUser(claim.address)
          return { ...claim, displayName: user?.display_name ?? null }
        }),
      )
    } finally {
      loading.value = false
    }
  }, 300)
})

function goToProfile(address) {
  router.push(`/profile/${encodeURIComponent(address)}`)
}
</script>

<template>
  <section class="pb-5">
    <header class="sticky top-0 z-20 border-b nf-divider bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <p class="nq-label text-[var(--nf-muted)]">Discover</p>
      <h1 class="nq-h3">Search People</h1>
      <input
        v-model="query"
        type="search"
        placeholder="Search usernames"
        autofocus
        class="nf-focus mt-3 w-full rounded-full border border-[var(--nf-border)] bg-white px-4 py-2.5 text-sm"
      />
    </header>

    <div v-if="loading" class="px-4 py-10 text-center text-sm text-[var(--nf-muted)] sm:px-6">Searching…</div>

    <div
      v-else-if="results.length === 0 && query.length >= 2"
      class="px-4 py-10 text-center text-sm text-[var(--nf-muted)] sm:px-6"
    >
      No users found for "{{ query }}"
    </div>

    <ul v-else class="px-4 pt-4 sm:px-6 space-y-2">
      <li
        v-for="result in results"
        :key="result.address"
        class="nf-card nf-press cursor-pointer px-3 py-3"
        @click="goToProfile(result.address)"
      >
        <div class="flex items-center gap-3">
          <AddressIdenticon :address="result.address" img-class="h-10 w-10" />
          <div class="min-w-0">
            <div class="text-sm font-semibold text-[var(--nf-text)]">@{{ result.username }}</div>
            <div v-if="result.displayName" class="text-xs text-[var(--nf-muted)]">{{ result.displayName }}</div>
            <div class="nf-mono truncate text-[11px] text-[var(--nf-muted)]">{{ result.address }}</div>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
