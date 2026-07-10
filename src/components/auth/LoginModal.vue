<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import { getUser } from '../../db/queries.js'
import OnboardingFlow from './OnboardingFlow.vue'
import NqDialog from '../common/NqDialog.vue'

const auth = useAuthStore()
const ui = useUiStore()
const walletRuntime = getWalletRuntime()
const { startDeltaSync } = useIndexer()
const error = ref(null)
const step = ref('idle')

const ONBOARDED_KEY = 'nimfeed_onboarded'

async function connect() {
  if (!walletRuntime.canConnect.value) return
  error.value = null
  step.value = 'connecting'
  try {
    const address = await walletRuntime.connect(auth.address ?? undefined)

    auth.setAddress(address)

    await startDeltaSync()

    const user = await getUser(auth.address)
    const previouslyOnboarded = localStorage.getItem(ONBOARDED_KEY) === '1'
    if (user?.username) {
      localStorage.setItem(ONBOARDED_KEY, '1')
    }
    if (!user?.username && !previouslyOnboarded && walletRuntime.canWriteBinaryTransactions.value) {
      step.value = 'onboarding'
    } else {
      await auth.loadProfile()
      ui.loginModalOpen = false
      step.value = 'idle'
    }
  } catch (err) {
    error.value = err.message
    step.value = 'idle'
  }
}
function onOnboardingDone() {
  localStorage.setItem(ONBOARDED_KEY, '1')
  ui.loginModalOpen = false
  step.value = 'idle'
}

function closeModal() {
  ui.loginModalOpen = false
  step.value = 'idle'
}
</script>

<template>
  <NqDialog
    :open="ui.loginModalOpen && step !== 'onboarding'"
    title="Connect to NimFeed"
    :description="walletRuntime.isNimiqPay.value
      ? 'Share and verify your active Nimiq Pay account to use NimFeed.'
      : 'Sign in with your Nimiq wallet via Hub.'"
    @close="closeModal"
  >
      <div v-if="step === 'idle'">
        <button
          class="nf-focus nq-button light-blue w-full"
          :disabled="!walletRuntime.canConnect.value"
          @click="connect"
        >
          {{ walletRuntime.isNimiqPay.value ? 'Connect Nimiq Pay' : 'Connect with Nimiq Hub' }}
        </button>
        <p v-if="error" class="mt-3 text-sm nf-danger-text" role="alert">{{ error }}</p>
      </div>

      <div v-else-if="step === 'connecting'" class="py-4 text-center text-sm text-[var(--nf-muted)]" aria-live="polite">
        {{ walletRuntime.isNimiqPay.value ? 'Waiting for Nimiq Pay…' : 'Waiting for Hub…' }}
      </div>

      <template #actions>
      <button type="button" class="nf-focus px-3 py-2 text-sm font-semibold text-[var(--nf-muted)]" style="min-height: 44px" @click="closeModal">
        Cancel
      </button>
      </template>
  </NqDialog>

  <OnboardingFlow
    v-if="ui.loginModalOpen && step === 'onboarding'"
    @done="onOnboardingDone"
    @cancel="closeModal"
  />
</template>
