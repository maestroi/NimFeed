import HubApi from '@nimiq/hub-api'
import { rpc } from './rpc.js'

const HUB_TESTNET = 'https://hub.nimiq-testnet.com'
const HUB_MAINNET = 'https://hub.nimiq.com'
const BURN_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

function getHubEndpoint() {
  const explicitUrl = String(import.meta.env.VITE_NIMFEED_HUB_URL || '').trim()
  if (explicitUrl) return explicitUrl

  const network = String(import.meta.env.VITE_NIMFEED_NETWORK || '').toLowerCase()
  return network === 'testnet' ? HUB_TESTNET : HUB_MAINNET
}

let _hub = null
function getHub() {
  if (!_hub) _hub = new HubApi(getHubEndpoint())
  return _hub
}

async function resolveValidityStartHeight(explicit) {
  if (explicit !== undefined && explicit !== null && explicit !== '+0') {
    const n = Number(explicit)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  const raw = await rpc.getBlockNumber()
  const n = Number(typeof raw === 'object' && raw !== null ? raw.blockNumber ?? raw.height ?? raw : raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Could not read chain height for transaction validity')
  }
  return Math.floor(n)
}

export function useHub() {
  function warmup() {
    // Hub iframe warmup is internal to HubApi; popup signing does not require preload.
  }

  async function signMessage(message, signer) {
    const req = {
      appName: 'NimFeed',
      message,
    }
    if (signer) req.signer = signer
    return getHub().signMessage(req)
  }

  async function signTransaction({
    sender,
    recipient,
    value,
    fee = 0,
    extraData,
    validityStartHeight,
  }) {
    if (!recipient || typeof recipient !== 'string') {
      throw new Error('Missing recipient address for transaction signing')
    }
    if (sender === recipient) {
      throw new Error('Sender and recipient must not match')
    }
    if (recipient.trim() === BURN_ADDRESS) {
      throw new Error('Refusing to sign transaction to burn address; configure VITE_NIMFEED_DATA_RECIPIENT_ADDRESS')
    }

    const data =
      extraData instanceof Uint8Array
        ? extraData
        : typeof extraData === 'string'
          ? new TextEncoder().encode(extraData)
          : extraData

    const vsh = await resolveValidityStartHeight(validityStartHeight)

    return getHub().signTransaction({
      appName: 'NimFeed',
      sender,
      recipient,
      value,
      fee,
      extraData: data,
      validityStartHeight: vsh,
    })
  }

  return { warmup, signMessage, signTransaction }
}
