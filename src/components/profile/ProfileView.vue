<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProfile } from '../../composables/useProfile.js'
import { useAuthStore } from '../../stores/auth.js'
import { db } from '../../db/schema.js'
import { rpc } from '../../chain/rpc.js'
import { POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS, EXPLORER_BASE_URL } from '../../protocol/constants.js'
import { isDebugLogsEnabled, setDebugLogsEnabled } from '../../debug/logging.js'
import ProfileCard from './ProfileCard.vue'
import PostCard from '../feed/PostCard.vue'
import PostSkeleton from '../feed/PostSkeleton.vue'

const auth = useAuthStore()
const route = useRoute()
const address = route.params.address
const { user, posts, loading } = useProfile(address)

const showDebug = ref(false)
const debugLoading = ref(false)
const debugData = ref(null)
const debugLogsEnabled = ref(isDebugLogsEnabled())

function formatTs(ts) {
  if (!ts) return null
  try {
    return new Date(ts).toISOString()
  } catch {
    return null
  }
}

async function loadDebug() {
  debugLoading.value = true
  try {
    const [users, claims, postRows, refs, follows, chunks, syncRows] = await Promise.all([
      db.users.count(),
      db.profile_claims.count(),
      db.posts.count(),
      db.catalog_refs.count(),
      db.follows.count(),
      db.post_chunks.count(),
      db.sync_state.toArray(),
    ])

    debugData.value = {
      network: String(import.meta.env.VITE_NIMFEED_NETWORK || 'mainnet(default)'),
      rpcEndpoint: rpc.url,
      explorerBase: EXPLORER_BASE_URL,
      postCatalog: POST_CATALOG_ADDRESS,
      followCatalog: FOLLOW_CATALOG_ADDRESS,
      account: auth.address ?? null,
      dbCounts: { users, claims, posts: postRows, refs, follows, chunks },
      syncState: syncRows
        .map((s) => ({
          scope: s.scope_key ?? s.address ?? null,
          newest: s.newest_seen_tx_hash ?? null,
          oldestCursor: s.oldest_synced_cursor ?? null,
          full: !!s.fully_synced,
          lastSyncedAt: formatTs(s.last_synced_at),
        }))
        .sort((a, b) => String(a.scope).localeCompare(String(b.scope))),
    }
  } finally {
    debugLoading.value = false
  }
}

async function toggleDebug() {
  showDebug.value = !showDebug.value
  if (showDebug.value) await loadDebug()
}

function toggleDebugLogs() {
  debugLogsEnabled.value = !debugLogsEnabled.value
  setDebugLogsEnabled(debugLogsEnabled.value)
}
</script>

<template>
  <section>
    <header class="sticky top-0 z-20 border-b nf-divider bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="nq-label !m-0 text-[var(--nf-muted)]">Profile</p>
          <h1 class="nq-h3 !m-0">Account</h1>
        </div>
        <button
          type="button"
          class="nf-focus rounded-md px-2 py-1 text-[11px] text-[var(--nf-muted)]/70 hover:text-[var(--nf-muted)]"
          title="Toggle diagnostics"
          @click="toggleDebug"
        >
          ···
        </button>
      </div>
    </header>

    <div v-if="showDebug" class="px-4 pt-3 sm:px-6">
      <section class="rounded-xl border border-[var(--nf-border)] bg-white p-3">
        <div class="mb-2 flex items-center justify-between">
          <p class="nq-label !m-0 text-[var(--nf-muted)]">Diagnostics</p>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="nf-focus text-xs font-semibold text-[var(--nf-primary)] hover:underline"
              @click="toggleDebugLogs"
            >
              logs: {{ debugLogsEnabled ? 'on' : 'off' }}
            </button>
            <button
              type="button"
              class="nf-focus text-xs font-semibold text-[var(--nf-primary)] hover:underline"
              :disabled="debugLoading"
              @click="loadDebug"
            >
              {{ debugLoading ? 'Loading…' : 'Refresh' }}
            </button>
          </div>
        </div>
        <div v-if="debugData" class="space-y-2 text-[11px] leading-relaxed text-[var(--nf-muted)]">
          <p><span class="font-semibold text-[var(--nf-text)]">network:</span> {{ debugData.network }}</p>
          <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">rpc:</span> {{ debugData.rpcEndpoint }}</p>
          <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">explorer:</span> {{ debugData.explorerBase }}</p>
          <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">postCatalog:</span> {{ debugData.postCatalog }}</p>
          <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">followCatalog:</span> {{ debugData.followCatalog }}</p>
          <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">account:</span> {{ debugData.account ?? 'none' }}</p>
          <p>
            <span class="font-semibold text-[var(--nf-text)]">db:</span>
            users={{ debugData.dbCounts.users }}, claims={{ debugData.dbCounts.claims }}, posts={{ debugData.dbCounts.posts }},
            refs={{ debugData.dbCounts.refs }}, follows={{ debugData.dbCounts.follows }}, chunks={{ debugData.dbCounts.chunks }}
          </p>
          <div>
            <p class="font-semibold text-[var(--nf-text)]">sync_state</p>
            <div v-if="!debugData.syncState.length" class="text-[var(--nf-muted)]">none</div>
            <div
              v-for="row in debugData.syncState"
              :key="row.scope"
              class="mt-1 rounded-lg border border-[var(--nf-border)] bg-[var(--nf-soft)] px-2 py-1"
            >
              <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">scope:</span> {{ row.scope }}</p>
              <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">newest:</span> {{ row.newest ?? 'null' }}</p>
              <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">cursor:</span> {{ row.oldestCursor ?? 'null' }}</p>
              <p><span class="font-semibold text-[var(--nf-text)]">full:</span> {{ row.full ? 'yes' : 'no' }}</p>
              <p><span class="font-semibold text-[var(--nf-text)]">last:</span> {{ row.lastSyncedAt ?? 'n/a' }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="loading && !user" class="px-4 pt-4 sm:px-6">
      <div class="nf-card animate-pulse p-5 space-y-3">
        <div class="h-16 w-16 rounded-full bg-slate-200" />
        <div class="h-4 w-1/3 rounded bg-slate-200" />
      </div>
    </div>

    <ProfileCard v-else :user="user" :address="address" />

    <div v-if="loading && !posts.length" class="px-4 pt-4 sm:px-6 space-y-3">
      <PostSkeleton v-for="i in 3" :key="i" />
    </div>

    <div v-else class="px-4 pt-4 pb-4 sm:px-6 space-y-3">
      <PostCard v-for="post in posts" :key="post.post_id" :post="post" :tip-height="0" />
    </div>

    <div v-if="!loading && !posts.length" class="px-4 pb-12 text-sm text-[var(--nf-muted)] sm:px-6">No posts yet.</div>
  </section>
</template>
