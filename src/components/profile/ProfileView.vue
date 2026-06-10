<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProfile } from '../../composables/useProfile.js'
import { useAuthStore } from '../../stores/auth.js'
import { usePost } from '../../composables/usePost.js'
import { db } from '../../db/schema.js'
import { clearLocalDatabase } from '../../db/queries.js'
import { rpc } from '../../chain/rpc.js'
import {
  getDefaultRpcEndpoint,
  getRpcEndpointPreference,
  setRpcEndpointPreference,
  clearRpcEndpointPreference,
  isValidRpcEndpoint,
  normalizeRpcEndpoint,
} from '../../chain/rpcSettings.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import { getWalletRuntime, loadSigningMap } from '../../chain/walletRuntime.js'
import { POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS, EXPLORER_BASE_URL } from '../../protocol/constants.js'
import { isDebugLogsEnabled, setDebugLogsEnabled } from '../../debug/logging.js'
import ProfileCard from './ProfileCard.vue'
import PostCard from '../feed/PostCard.vue'
import PostSkeleton from '../feed/PostSkeleton.vue'

const auth = useAuthStore()
const route = useRoute()
const address = route.params.address
const { user, posts, loading } = useProfile(address)
const { startDeltaSync } = useIndexer()
const { claimProfile } = usePost()

const savingProfile = ref(false)

async function handleSaveProfile({ username, displayName, onSuccess, onError }) {
  savingProfile.value = true
  try {
    await claimProfile(username, displayName)
    onSuccess()
  } catch (err) {
    onError(err.message)
  } finally {
    savingProfile.value = false
  }
}

const showDebug = ref(false)
const showRpcSettings = ref(false)
const menuOpen = ref(false)
const debugLoading = ref(false)
const resettingIndex = ref(false)
const debugData = ref(null)
const debugLogsEnabled = ref(isDebugLogsEnabled())
const defaultRpcEndpoint = getDefaultRpcEndpoint()
const customRpcEndpoint = ref(getRpcEndpointPreference())
const rpcInput = ref(customRpcEndpoint.value ?? rpc.url ?? defaultRpcEndpoint)
const rpcSaving = ref(false)
const rpcError = ref('')
const rpcNotice = ref('')
const isSelf = computed(() => auth.address === address)
const menuRef = ref(null)

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

    const wr = getWalletRuntime()
    debugData.value = {
      network: String(import.meta.env.VITE_NIMFEED_NETWORK || 'mainnet(default)'),
      rpcEndpoint: rpc.url,
      explorerBase: EXPLORER_BASE_URL,
      postCatalog: POST_CATALOG_ADDRESS,
      followCatalog: FOLLOW_CATALOG_ADDRESS,
      account: auth.address ?? null,
      wallet: {
        kind: wr.kind?.value ?? null,
        custodialAddress: wr.custodialAddress?.value ?? null,
        lastConnectInfo: wr.lastConnectInfo?.value ?? null,
        signingMap: loadSigningMap(),
      },
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

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

async function toggleDebugFromMenu() {
  menuOpen.value = false
  await toggleDebug()
}

function toggleRpcFromMenu() {
  menuOpen.value = false
  showRpcSettings.value = !showRpcSettings.value
}

async function resetLocalIndex() {
  menuOpen.value = false
  if (
    !window.confirm(
      'This clears all locally cached posts, profiles, and sync progress, then re-syncs from the chain. Continue?',
    )
  ) {
    return
  }
  resettingIndex.value = true
  try {
    await clearLocalDatabase()
    window.location.reload()
  } catch {
    resettingIndex.value = false
  }
}

function toggleDebugLogs() {
  debugLogsEnabled.value = !debugLogsEnabled.value
  setDebugLogsEnabled(debugLogsEnabled.value)
}

async function saveRpcEndpoint() {
  rpcSaving.value = true
  rpcError.value = ''
  rpcNotice.value = ''
  try {
    const next = normalizeRpcEndpoint(rpcInput.value)
    if (!isValidRpcEndpoint(next)) throw new Error('Invalid URL. Use full http(s) endpoint.')
    const saved = setRpcEndpointPreference(next)
    customRpcEndpoint.value = saved
    rpc.setEndpoint(saved)
    await startDeltaSync()
    rpcNotice.value = 'RPC endpoint updated.'
    if (showDebug.value) await loadDebug()
  } catch (err) {
    rpcError.value = err?.message ?? String(err)
  } finally {
    rpcSaving.value = false
  }
}

async function resetRpcEndpoint() {
  rpcSaving.value = true
  rpcError.value = ''
  rpcNotice.value = ''
  try {
    clearRpcEndpointPreference()
    customRpcEndpoint.value = null
    rpcInput.value = defaultRpcEndpoint
    rpc.setEndpoint(defaultRpcEndpoint)
    await startDeltaSync()
    rpcNotice.value = 'Using default RPC endpoint.'
    if (showDebug.value) await loadDebug()
  } catch (err) {
    rpcError.value = err?.message ?? String(err)
  } finally {
    rpcSaving.value = false
  }
}

function onDocumentPointerDown(event) {
  if (!menuOpen.value) return
  const root = menuRef.value
  if (root && !root.contains(event.target)) {
    menuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <section>
    <header class="sticky top-0 z-20 border-b nf-divider bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="nq-label !m-0 text-[var(--nf-muted)]">Profile</p>
          <h1 class="nq-h3 !m-0">Account</h1>
        </div>
        <div ref="menuRef" class="relative">
          <button
            type="button"
            class="nf-focus rounded-md px-2 py-1 text-[11px] text-[var(--nf-muted)]/70 hover:text-[var(--nf-muted)]"
            title="Profile options"
            @click="toggleMenu"
          >
            ···
          </button>
          <div
            v-if="menuOpen"
            class="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-[var(--nf-border)] bg-white p-1 shadow-sm"
          >
            <button
              type="button"
              class="nf-focus block w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--nf-text)] hover:bg-[var(--nf-soft)]"
              @click="toggleDebugFromMenu"
            >
              {{ showDebug ? 'Hide diagnostics' : 'Show diagnostics' }}
            </button>
            <button
              v-if="isSelf"
              type="button"
              class="nf-focus block w-full rounded-md px-2 py-1.5 text-left text-xs text-[var(--nf-text)] hover:bg-[var(--nf-soft)]"
              @click="toggleRpcFromMenu"
            >
              {{ showRpcSettings ? 'Hide custom RPC' : 'Custom RPC' }}
            </button>
            <button
              v-if="isSelf"
              type="button"
              class="nf-focus block w-full rounded-md px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
              :disabled="resettingIndex"
              @click="resetLocalIndex"
            >
              {{ resettingIndex ? 'Resetting…' : 'Reset local index' }}
            </button>
          </div>
        </div>
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
          <div>
            <p class="font-semibold text-[var(--nf-text)]">wallet connection</p>
            <div class="mt-1 rounded-lg border border-[var(--nf-border)] bg-[var(--nf-soft)] px-2 py-1">
              <p><span class="font-semibold text-[var(--nf-text)]">kind:</span> {{ debugData.wallet.kind ?? 'unknown' }}</p>
              <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">custodial:</span> {{ debugData.wallet.custodialAddress ?? 'none' }}</p>
              <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">lastConnect:</span> {{ debugData.wallet.lastConnectInfo ? JSON.stringify(debugData.wallet.lastConnectInfo) : 'none' }}</p>
              <p class="break-all"><span class="font-semibold text-[var(--nf-text)]">signingMap:</span> {{ Object.keys(debugData.wallet.signingMap).length ? JSON.stringify(debugData.wallet.signingMap) : 'empty' }}</p>
            </div>
          </div>
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

    <ProfileCard v-else :user="user" :address="address" :saving-profile="savingProfile" @save-profile="handleSaveProfile" />

    <div v-if="isSelf && showRpcSettings" class="px-4 pt-3 sm:px-6">
      <section class="rounded-xl border border-[var(--nf-border)] bg-white p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="nq-label !m-0 text-[var(--nf-muted)]">RPC Endpoint</p>
            <p class="mt-1 text-xs text-[var(--nf-muted)]">
              Change chain data source. Default is used when custom is empty.
            </p>
          </div>
          <span
            class="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            :class="
              customRpcEndpoint
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-[var(--nf-border)] bg-[var(--nf-soft)] text-[var(--nf-muted)]'
            "
          >
            {{ customRpcEndpoint ? 'custom' : 'default' }}
          </span>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-[var(--nf-muted)]">Endpoint URL</label>
        <input
          v-model="rpcInput"
          type="url"
          class="nf-focus mt-1 w-full rounded-lg border border-[var(--nf-border)] bg-white px-3 py-2 text-sm text-[var(--nf-text)]"
          placeholder="https://rpc-mainnet.nimiqscan.com"
          autocomplete="off"
          spellcheck="false"
        />

        <p class="mt-2 break-all text-[11px] text-[var(--nf-muted)]">default: {{ defaultRpcEndpoint }}</p>
        <p v-if="rpcError" class="mt-1 text-xs text-rose-600">{{ rpcError }}</p>
        <p v-else-if="rpcNotice" class="mt-1 text-xs text-emerald-700">{{ rpcNotice }}</p>

        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="nf-focus nf-press rounded-full nq-blue-bg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            :disabled="rpcSaving"
            @click="saveRpcEndpoint"
          >
            {{ rpcSaving ? 'Saving…' : 'Save endpoint' }}
          </button>
          <button
            type="button"
            class="nf-focus rounded-full border border-[var(--nf-border)] px-4 py-2 text-xs font-semibold text-[var(--nf-muted)] hover:text-[var(--nf-text)] disabled:opacity-50"
            :disabled="rpcSaving"
            @click="resetRpcEndpoint"
          >
            Reset default
          </button>
        </div>
      </section>
    </div>

    <div v-if="loading && !posts.length" class="px-4 pt-4 sm:px-6 space-y-3">
      <PostSkeleton v-for="i in 3" :key="i" />
    </div>

    <div v-else class="px-4 pt-4 pb-4 sm:px-6 space-y-3">
      <PostCard v-for="post in posts" :key="post.post_id" :post="post" :tip-height="0" />
    </div>

    <div v-if="!loading && !posts.length" class="px-4 pb-12 text-sm text-[var(--nf-muted)] sm:px-6">No posts yet.</div>
  </section>
</template>
