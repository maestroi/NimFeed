import { computed, shallowRef, ref } from 'vue'
import { init } from '@nimiq/mini-app-sdk'
import { useHub } from './hub.js'
import { encodeMiniAppEnvelope } from '../protocol/miniAppEnvelope.js'
import { blake2b } from '@noble/hashes/blake2.js'
import { addressBytesToNq, canonicalNqAddress } from '../protocol/address.js'
import { hexToBytes } from '../protocol/utils.js'

export const BINARY_TRANSACTIONS_UNSUPPORTED =
  'Nimiq Pay cannot publish NimFeed posts yet because its provider does not support the required binary transaction data.'

const SIGNING_MAP_KEY = 'nimfeed_pay_signing_map'

function providerError(value) {
  if (!value || typeof value !== 'object' || !('error' in value)) return null
  return value.error?.message || 'Nimiq Pay provider request failed.'
}

function deriveAddressFromPublicKey(publicKey) {
  return addressBytesToNq(blake2b(hexToBytes(publicKey), { dkLen: 32 }).slice(0, 20))
}

export function loadSigningMap() {
  try {
    return JSON.parse(localStorage.getItem(SIGNING_MAP_KEY) || '{}')
  } catch {
    return {}
  }
}

function getCachedSigningAddress(custodialAddress) {
  const map = loadSigningMap()
  return map[canonicalNqAddress(custodialAddress)] ?? null
}

function rememberSigningAddress(custodialAddress, signingAddress) {
  const map = loadSigningMap()
  map[canonicalNqAddress(custodialAddress)] = canonicalNqAddress(signingAddress)
  localStorage.setItem(SIGNING_MAP_KEY, JSON.stringify(map))
}

export function createWalletRuntime({
  initMiniApp = init,
  hub = useHub(),
  timeout = 10_000,
} = {}) {
  const kind = ref('detecting')
  const provider = shallowRef(null)
  const lastConnectInfo = shallowRef(null)
  const custodialAddress = shallowRef(null)
  let initialization = null

  const isNimiqPay = computed(() => kind.value === 'nimiq-pay')
  const canConnect = computed(() => true)
  const canPublishPosts = computed(() => kind.value !== 'detecting')
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

      custodialAddress.value = result[0]

      const debugInfo = { listAccounts: result, sign: null, derivedFromSign: null }

      if (typeof provider.value.sign === 'function') {
        try {
          const signed = await provider.value.sign('Login to NimFeed')
          const signError = providerError(signed)
          if (signError) {
            debugInfo.sign = { error: signError }
          } else {
            debugInfo.sign = { publicKey: signed?.publicKey ?? null, signature: signed?.signature ?? null }
            if (signed?.publicKey) {
              debugInfo.derivedFromSign = deriveAddressFromPublicKey(signed.publicKey)
            }
          }
        } catch (err) {
          debugInfo.sign = { error: err?.message ?? String(err) }
        }
      }

      lastConnectInfo.value = debugInfo

      const cachedSigningAddress = getCachedSigningAddress(result[0])
      if (cachedSigningAddress) return cachedSigningAddress

      if (debugInfo.derivedFromSign) return debugInfo.derivedFromSign

      return result[0]
    }

    const signed = await hub.signMessage('Login to NimFeed', existingAddress || undefined)
    return signed.signer
  }

  async function sendMiniAppTransaction({ recipient, value, fee = 0, extraData, validityStartHeight }) {
    await initialize()
    if (kind.value !== 'nimiq-pay') {
      throw new Error('Nimiq Pay transaction provider is unavailable.')
    }
    const request = {
      recipient,
      value,
      fee,
    }
    if (extraData) request.data = encodeMiniAppEnvelope(extraData)
    if (validityStartHeight !== undefined) request.validityStartHeight = validityStartHeight
    const result = await provider.value.sendBasicTransactionWithData(request)
    const error = providerError(result)
    if (error) throw new Error(error)
    return result
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
    canPublishPosts,
    canWriteBinaryTransactions,
    lastConnectInfo,
    custodialAddress,
    initialize,
    connect,
    sendMiniAppTransaction,
    assertBinaryTransactionsSupported,
    rememberSigningAddress,
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
