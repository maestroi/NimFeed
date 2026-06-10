const DEFAULT_ENDPOINT = 'https://rpc-mainnet.nimiqscan.com'
const TESTNET_ENDPOINT = 'https://rpc-testnet.nimiqwatch.com'
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export class NimiqRPC {
  constructor(url = DEFAULT_ENDPOINT) {
    this.url = url
    this._id = 1
  }

  setEndpoint(url) {
    this.url = url
  }

  async call(method, params = []) {
    let attempt = 0
    while (true) {
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: this._id++, method, params }),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error))
        return json.result
      } catch (err) {
        if (++attempt >= MAX_RETRIES) throw err
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)))
      }
    }
  }

  unwrapData(result) {
    if (result && typeof result === 'object' && 'data' in result) return result.data
    return result
  }

  normalizeTransaction(raw) {
    return {
      hash: raw.hash,
      from: raw.sender ?? raw.from,
      to: raw.recipient ?? raw.to,
      value: raw.value,
      data: raw.data ?? raw.recipientData ?? raw.extraData ?? '',
      blockHeight: raw.blockNumber ?? raw.blockHeight ?? 0,
      transactionIndex: raw.transactionIndex ?? 0,
      timestamp: raw.timestamp ?? 0,
    }
  }

  async getBlockNumber() {
    const result = this.unwrapData(await this.call('getBlockNumber'))
    return typeof result === 'object' ? result.blockNumber ?? result : result
  }

  async getTransactionsByAddress(address, max = 500, startAt = null) {
    let result
    try {
      // Mainnet nimiqscan endpoint expects exactly 3 positional args.
      result = await this.call('getTransactionsByAddress', [address, max, startAt ?? null])
    } catch {
      // Fallback for endpoints that expect object params.
      result = await this.call('getTransactionsByAddress', [{ address, max, startAt: startAt ?? null }])
    }
    const normalized = this.unwrapData(result)
    const txs = Array.isArray(normalized) ? normalized : normalized?.data ?? []
    return txs.map((tx) => this.normalizeTransaction(tx))
  }

  async getAccountByAddress(address) {
    const result = this.unwrapData(await this.call('getAccountByAddress', [address]))
    return result ?? null
  }

  async getTransactionByHash(hash) {
    const result = this.unwrapData(await this.call('getTransactionByHash', [hash]))
    if (!result) return null
    return this.normalizeTransaction(result)
  }

  async sendRawTransaction(serializedHex) {
    const hex =
      typeof serializedHex === 'string' ? serializedHex.replace(/^0x/i, '').trim() : serializedHex
    return this.call('sendRawTransaction', [hex])
  }
}

export { TESTNET_ENDPOINT, DEFAULT_ENDPOINT }
export const rpc = new NimiqRPC()
