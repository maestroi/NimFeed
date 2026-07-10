<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import BottomNav from './BottomNav.vue'
import LoginModal from '../auth/LoginModal.vue'
import PostComposer from '../post/PostComposer.vue'
import TipModal from '../post/TipModal.vue'
import NqDialog from '../common/NqDialog.vue'
import { useUiStore } from '../../stores/ui.js'
import { useAuthStore } from '../../stores/auth.js'
import { useHub } from '../../chain/hub.js'
import { getWalletRuntime, initializeWalletRuntime } from '../../chain/walletRuntime.js'
import { shellClasses } from '../../chain/miniAppLayout.js'
import { provideIndexer } from '../../indexer/useIndexer.js'
import { rpc } from '../../chain/rpc.js'
import { getDefaultRpcEndpoint, resolveRpcEndpoint } from '../../chain/rpcSettings.js'
import {
  POST_CATALOG_ADDRESS,
  FOLLOW_CATALOG_ADDRESS,
  NON_SELF_TX_RECIPIENT,
} from '../../protocol/constants.js'

const ui = useUiStore()
const auth = useAuthStore()
const hub = useHub()
const walletRuntime = getWalletRuntime()
const indexer = provideIndexer(rpc)

function closeComposer() {
  ui.composerOpen = false
  ui.composerReplyTo = null
}

function syncAuthProfile() {
  if (!auth.isLoggedIn) return
  auth.loadProfile().catch(() => {})
}

onMounted(() => {
  const network = String(import.meta.env.VITE_NIMFEED_NETWORK || '').toLowerCase()
  const defaultRpc = getDefaultRpcEndpoint(network)
  const activeRpc = resolveRpcEndpoint(network)
  rpc.setEndpoint(activeRpc)
  initializeWalletRuntime().catch(() => {})
  hub.warmup()
  if (import.meta.env.DEV) {
    console.info('[NimFeed config]', {
      network: network || 'mainnet(default)',
      rpc: activeRpc,
      rpcDefault: defaultRpc,
      rpcCustom: activeRpc !== defaultRpc,
      postCatalog: POST_CATALOG_ADDRESS,
      followCatalog: FOLLOW_CATALOG_ADDRESS,
      dataRecipient: NON_SELF_TX_RECIPIENT,
      hub:
        import.meta.env.VITE_NIMFEED_HUB_URL ||
        (network === 'testnet' ? 'https://hub.nimiq-testnet.com' : 'https://hub.nimiq.com'),
    })
  }
  indexer.startDeltaSync().then(syncAuthProfile).catch(() => {})
  indexer.startDeltaSyncLoop()
  indexer.addEventListener('catalog:updated', syncAuthProfile)
})

onBeforeUnmount(() => {
  indexer.removeEventListener('catalog:updated', syncAuthProfile)
})
</script>

<template>
  <div :class="shellClasses(walletRuntime.isNimiqPay.value).outer">
    <div :class="shellClasses(walletRuntime.isNimiqPay.value).page">
      <main class="h-full overflow-y-auto overscroll-y-contain pb-28">
        <router-view />
      </main>
      <BottomNav />
      <LoginModal />
      <TipModal />

      <NqDialog
        :open="ui.composerOpen"
        title="New Post"
        panel-class="nf-dialog-wide"
        @close="closeComposer"
      >
        <PostComposer v-if="ui.composerOpen" />
      </NqDialog>
    </div>
  </div>
</template>
