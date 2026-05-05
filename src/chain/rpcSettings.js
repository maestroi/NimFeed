import { DEFAULT_ENDPOINT, TESTNET_ENDPOINT } from './rpc.js'

export const RPC_ENDPOINT_LS_KEY = 'nimfeed_rpc_endpoint'

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function getDefaultRpcEndpoint(network = null) {
  const effective =
    (network ?? String(import.meta.env.VITE_NIMFEED_NETWORK || '').toLowerCase()).trim().toLowerCase()
  return effective === 'testnet' ? TESTNET_ENDPOINT : DEFAULT_ENDPOINT
}

export function normalizeRpcEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '')
}

export function isValidRpcEndpoint(endpoint) {
  const normalized = normalizeRpcEndpoint(endpoint)
  if (!normalized) return false
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function getRpcEndpointPreference() {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(RPC_ENDPOINT_LS_KEY)
  if (!raw) return null
  const normalized = normalizeRpcEndpoint(raw)
  return isValidRpcEndpoint(normalized) ? normalized : null
}

export function setRpcEndpointPreference(endpoint) {
  const storage = getStorage()
  const normalized = normalizeRpcEndpoint(endpoint)
  if (!isValidRpcEndpoint(normalized)) {
    throw new Error('Invalid RPC endpoint URL. Use http(s)://host')
  }
  if (!storage) return normalized
  storage.setItem(RPC_ENDPOINT_LS_KEY, normalized)
  return normalized
}

export function clearRpcEndpointPreference() {
  const storage = getStorage()
  storage?.removeItem(RPC_ENDPOINT_LS_KEY)
}

export function resolveRpcEndpoint(network = null) {
  return getRpcEndpointPreference() ?? getDefaultRpcEndpoint(network)
}
