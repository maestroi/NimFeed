export const MAGIC = new Uint8Array([0x4e, 0x46])
export const VERSION = 0x01

export const TYPES = Object.freeze({
  PROFILE_CLAIM: 0x01,
  POST_INLINE: 0x02,
  POST_START: 0x03,
  POST_CHUNK: 0x04,
  FOLLOW: 0x05,
  UNFOLLOW: 0x06,
})

const network = String(import.meta.env.VITE_NIMFEED_NETWORK || '').toLowerCase()
const FALLBACK_TESTNET_POST = 'NQ32 0VD4 26TR 1394 KXBJ 862C NFKG 61M5 GFJ0'
/** Mirrors catalog wallet from `admin-bootstrap.mjs` — use only when `VITE_NIMFEED_MAINNET_CATALOG_ADDRESS` is unset */
const FALLBACK_MAINNET_POST = 'NQ19 LLHP G0ML 37RM 5JJD RME1 GLFY 75PQ 402Y'
const FALLBACK_MAINNET_EXPLORER = 'https://nimiqscan.com'
const FALLBACK_TESTNET_EXPLORER = 'https://test.nimiq.watch'

export const MAINNET_POST_CATALOG_ADDRESS = String(import.meta.env.VITE_NIMFEED_MAINNET_CATALOG_ADDRESS || '').trim()
export const TESTNET_POST_CATALOG_ADDRESS = String(
  import.meta.env.VITE_NIMFEED_TESTNET_CATALOG_ADDRESS || FALLBACK_TESTNET_POST,
).trim()

export const POST_CATALOG_ADDRESS =
  network === 'testnet'
    ? TESTNET_POST_CATALOG_ADDRESS
    : MAINNET_POST_CATALOG_ADDRESS || FALLBACK_MAINNET_POST

export const MAINNET_FOLLOW_CATALOG_ADDRESS = String(
  import.meta.env.VITE_NIMFEED_MAINNET_FOLLOW_CATALOG_ADDRESS || '',
).trim()
export const TESTNET_FOLLOW_CATALOG_ADDRESS = String(
  import.meta.env.VITE_NIMFEED_TESTNET_FOLLOW_CATALOG_ADDRESS || '',
).trim()

export const FOLLOW_CATALOG_ADDRESS =
  network === 'testnet'
    ? TESTNET_FOLLOW_CATALOG_ADDRESS || POST_CATALOG_ADDRESS
    : MAINNET_FOLLOW_CATALOG_ADDRESS || POST_CATALOG_ADDRESS

export const MAINNET_BOOTSTRAP_ADDRESS = String(import.meta.env.VITE_NIMFEED_MAINNET_BOOTSTRAP_ADDRESS || '').trim()
export const TESTNET_BOOTSTRAP_ADDRESS = String(import.meta.env.VITE_NIMFEED_TESTNET_BOOTSTRAP_ADDRESS || '').trim()

export const MAINNET_EXPLORER_BASE_URL = String(
  import.meta.env.VITE_NIMFEED_MAINNET_EXPLORER_BASE_URL || FALLBACK_MAINNET_EXPLORER,
).trim()
export const TESTNET_EXPLORER_BASE_URL = String(
  import.meta.env.VITE_NIMFEED_TESTNET_EXPLORER_BASE_URL || FALLBACK_TESTNET_EXPLORER,
).trim()

export const EXPLORER_BASE_URL =
  network === 'testnet' ? TESTNET_EXPLORER_BASE_URL : MAINNET_EXPLORER_BASE_URL

/** Legacy env name + data recipient used by hub guardrails */
export const NON_SELF_TX_RECIPIENT = String(
  import.meta.env.VITE_NIMFEED_DATA_RECIPIENT_ADDRESS ||
    (network === 'testnet' ? TESTNET_BOOTSTRAP_ADDRESS : MAINNET_BOOTSTRAP_ADDRESS) ||
    POST_CATALOG_ADDRESS,
).trim()

export const CATALOG_ADDRESS = POST_CATALOG_ADDRESS

export const TX_VALUE_LUNA = 1
export const FEED_PAGE_SIZE = 20
export const CHUNK_DATA_SIZE = 50
export const INLINE_MAX_NO_REPLY = 51
export const INLINE_MAX_WITH_REPLY = 23
export const MAX_POST_CHARS = 280
export const MISSING_CHUNKS_BLOCK_WINDOW = 48
export const TENTATIVE_BLOCK_CONFIRMATIONS = 10
export const SYNC_PAGE_SIZE = 500
export const SYNC_TX_BUDGET_PER_TICK = 2000
export const SYNC_WALL_CLOCK_BUDGET_MS = 10_000
