<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getMostActiveUsers, searchUsernames, getUser } from '../../db/queries.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import AddressIdenticon from '../common/AddressIdenticon.vue'

const router = useRouter()
const { indexer } = useIndexer()
const query = ref('')
const results = ref([])
const activePeople = ref([])
const loading = ref(false)
const activeLoading = ref(true)
const displayedPeople = computed(() => (query.value.length >= 2 ? results.value : activePeople.value))

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

async function loadActivePeople() {
  try {
    const users = await getMostActiveUsers(10)
    activePeople.value = users.map((user) => ({
      ...user,
      displayName: user.display_name ?? null,
    }))
  } finally {
    activeLoading.value = false
  }
}

onMounted(() => {
  void loadActivePeople()
  indexer.addEventListener('catalog:updated', loadActivePeople)
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  indexer.removeEventListener('catalog:updated', loadActivePeople)
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
        aria-label="Search usernames"
        placeholder="Search usernames"
        autofocus
        class="nf-focus nf-input mt-3 w-full px-4 py-2.5 text-sm"
      />
    </header>

    <div v-if="loading" class="px-4 py-10 text-center text-sm text-[var(--nf-muted)] sm:px-6">Searching…</div>

    <div
      v-else-if="results.length === 0 && query.length >= 2"
      class="px-4 py-10 text-center text-sm text-[var(--nf-muted)] sm:px-6"
    >
      No users found for "{{ query }}"
    </div>

    <div
      v-else-if="query.length < 2 && activeLoading"
      class="px-4 py-10 text-center text-sm text-[var(--nf-muted)] sm:px-6"
    >
      Finding active people…
    </div>

    <div
      v-else-if="query.length < 2 && activePeople.length === 0"
      class="px-4 py-10 text-center text-sm text-[var(--nf-muted)] sm:px-6"
    >
      No active people indexed yet.
    </div>

    <div v-else class="px-4 pt-4 sm:px-6">
      <div v-if="query.length < 2" class="mb-3 flex items-end justify-between gap-4">
        <div>
          <p class="nq-label text-[var(--nf-muted)]">Discover</p>
          <h2 class="text-base font-bold text-[var(--nf-text)]">Active people</h2>
        </div>
        <span class="text-xs text-[var(--nf-muted)]">By indexed posts</span>
      </div>

      <ul class="space-y-2">
      <li
        v-for="result in displayedPeople"
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
          <div
            v-if="query.length < 2"
            class="ml-auto shrink-0 rounded-full bg-[var(--nf-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--nf-primary)]"
          >
            {{ result.postCount }} {{ result.postCount === 1 ? 'post' : 'posts' }}
          </div>
        </div>
      </li>
      </ul>
    </div>
  </section>
</template>
