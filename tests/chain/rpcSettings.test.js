import { afterEach, describe, expect, it } from 'vitest'
import {
  RPC_ENDPOINT_LS_KEY,
  clearRpcEndpointPreference,
  getDefaultRpcEndpoint,
  getRpcEndpointPreference,
  isValidRpcEndpoint,
  normalizeRpcEndpoint,
  resolveRpcEndpoint,
  setRpcEndpointPreference,
} from '../../src/chain/rpcSettings.js'

afterEach(() => {
  localStorage.removeItem(RPC_ENDPOINT_LS_KEY)
})

describe('rpcSettings', () => {
  it('returns network defaults', () => {
    expect(getDefaultRpcEndpoint('mainnet')).toBe('https://rpc-mainnet.nimiqscan.com')
    expect(getDefaultRpcEndpoint('testnet')).toBe('https://rpc-testnet.nimiqwatch.com')
  })

  it('validates and normalizes endpoint URLs', () => {
    expect(normalizeRpcEndpoint(' https://rpc.example.com/ ')).toBe('https://rpc.example.com')
    expect(isValidRpcEndpoint('https://rpc.example.com')).toBe(true)
    expect(isValidRpcEndpoint('http://localhost:8648')).toBe(true)
    expect(isValidRpcEndpoint('ws://rpc.example.com')).toBe(false)
  })

  it('stores and resolves custom endpoint', () => {
    setRpcEndpointPreference('https://rpc.custom.example/')
    expect(getRpcEndpointPreference()).toBe('https://rpc.custom.example')
    expect(resolveRpcEndpoint('mainnet')).toBe('https://rpc.custom.example')
  })

  it('clears preference and falls back to default', () => {
    setRpcEndpointPreference('https://rpc.custom.example')
    clearRpcEndpointPreference()
    expect(getRpcEndpointPreference()).toBeNull()
    expect(resolveRpcEndpoint('mainnet')).toBe('https://rpc-mainnet.nimiqscan.com')
  })
})
