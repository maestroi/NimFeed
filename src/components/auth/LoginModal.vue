<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { useUiStore } from '../../stores/ui.js'
import { getWalletRuntime } from '../../chain/walletRuntime.js'
import { useIndexer } from '../../indexer/useIndexer.js'
import { getUser } from '../../db/queries.js'
import OnboardingFlow from './OnboardingFlow.vue'

const auth = useAuthStore()
const ui = useUiStore()
const walletRuntime = getWalletRuntime()
const { startDeltaSync } = useIndexer()
const error = ref(null)
const step = ref('idle')

async function connect() {
  if (!walletRuntime.canConnect.value) return
  error.value = null
  step.value = 'connecting'
  try {
    const address = await walletRuntime.connect(auth.address ?? undefined)

    auth.setAddress(address)

    await startDeltaSync()

    const user = await getUser(address)
    if (!user?.username && walletRuntime.canWriteBinaryTransactions.value) {
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
  ui.loginModalOpen = false
  step.value = 'idle'
}

function closeModal() {
  ui.loginModalOpen = false
  step.value = 'idle'
}
</script>

<template>
  <div v-if="ui.loginModalOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl">
      <h2 class="text-xl font-bold mb-4">Connect to NimFeed</h2>

      <div v-if="step === 'idle'">
        <p class="text-gray-500 text-sm mb-6">
          {{
            walletRuntime.isNimiqPay.value
              ? 'Share a Nimiq Pay account to use NimFeed. Publishing is currently read-only.'
              : 'Sign in with your Nimiq wallet via Hub.'
          }}
        </p>
        <button
          class="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          :disabled="!walletRuntime.canConnect.value"
          @click="connect"
        >
          {{ walletRuntime.isNimiqPay.value ? 'Connect Nimiq Pay' : 'Connect with Nimiq Hub' }}
        </button>
        <p v-if="error" class="mt-3 text-red-500 text-sm">{{ error }}</p>
      </div>

      <div v-else-if="step === 'connecting'" class="text-center py-4 text-gray-500">
        {{ walletRuntime.isNimiqPay.value ? 'Waiting for Nimiq Pay…' : 'Waiting for Hub…' }}
      </div>

      <div v-else-if="step === 'onboarding'">
        <OnboardingFlow @done="onOnboardingDone" />
      </div>

      <button class="mt-4 w-full py-2 text-gray-400 text-sm hover:text-gray-600" @click="closeModal">
        Cancel
      </button>
    </div>
  </div>
</template>
