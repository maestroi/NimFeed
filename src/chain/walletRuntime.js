import { computed, shallowRef, ref } from 'vue'
import { init } from '@nimiq/mini-app-sdk'
import { useHub } from './hub.js'

export const BINARY_TRANSACTIONS_UNSUPPORTED =
  'Nimiq Pay cannot publish NimFeed posts yet because its provider does not support the required binary transaction data.'

function providerError(value) {
  if (!value || typeof value !== 'object' || !('error' in value)) return null
  return value.error?.message || 'Nimiq Pay provider request failed.'
}

export function createWalletRuntime({
  initMiniApp = init,
  hub = useHub(),
  timeout = 10_000,
} = {}) {
  const kind = ref('detecting')
  const provider = shallowRef(null)
  let initialization = null

  const isNimiqPay = computed(() => kind.value === 'nimiq-pay')
  const canConnect = computed(() => kind.value !== 'nimiq-pay')
  const canWriteBinaryTransactions = computed(() => kind.value === 'browser')

  async function initialize() {
    if (initialization) return initialization
    initialization = (async () => {
      try {
        provider.value = await initMiniApp({ timeout })
        kind.value = 'nimiq-pay'
      } catch {
        provider.value = null
        kind.value = 'browser'
      }
      return kind.value
    })()
    return initialization
  }

  async function connect(existingAddress) {
    await initialize()
    if (kind.value === 'nimiq-pay') {
      const result = await provider.value.listAccounts()
      const error = providerError(result)
      if (error) throw new Error(error)
      if (!Array.isArray(result) || !result.length) {
        throw new Error('No Nimiq Pay account was shared.')
      }
      return result[0]
    }

    const signed = await hub.signMessage('Login to NimFeed', existingAddress || undefined)
    return signed.signer
  }

  function assertBinaryTransactionsSupported() {
    if (kind.value === 'detecting') {
      throw new Error('Wallet runtime is still initializing. Please try again.')
    }
    if (!canWriteBinaryTransactions.value) {
      throw new Error(BINARY_TRANSACTIONS_UNSUPPORTED)
    }
  }

  return {
    kind,
    isNimiqPay,
    canConnect,
    canWriteBinaryTransactions,
    initialize,
    connect,
    assertBinaryTransactionsSupported,
  }
}

let runtime

export function getWalletRuntime() {
  if (!runtime) runtime = createWalletRuntime()
  return runtime
}

export function initializeWalletRuntime() {
  return getWalletRuntime().initialize()
}
