import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: {
    isLoggedIn: true,
    address: 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD',
    username: 'maestro',
    loadProfile: vi.fn(),
  },
  signTransaction: vi.fn(),
  sendRawTransaction: vi.fn(),
  startDeltaSync: vi.fn(),
  getWinningClaim: vi.fn(),
  putPost: vi.fn(),
  updatePost: vi.fn(),
  assertBinaryTransactionsSupported: vi.fn(),
  isNimiqPay: { value: false },
  sendMiniAppTransaction: vi.fn(),
}))

vi.mock('../../src/stores/auth.js', () => ({
  useAuthStore: () => mocks.auth,
}))

vi.mock('../../src/chain/hub.js', () => ({
  useHub: () => ({
    signTransaction: mocks.signTransaction,
  }),
}))

vi.mock('../../src/chain/rpc.js', () => ({
  rpc: {
    sendRawTransaction: mocks.sendRawTransaction,
  },
}))

vi.mock('../../src/chain/walletRuntime.js', () => ({
  getWalletRuntime: () => ({
    assertBinaryTransactionsSupported: mocks.assertBinaryTransactionsSupported,
    isNimiqPay: mocks.isNimiqPay,
    sendMiniAppTransaction: mocks.sendMiniAppTransaction,
  }),
}))

vi.mock('../../src/indexer/useIndexer.js', () => ({
  useIndexer: () => ({
    startDeltaSync: mocks.startDeltaSync,
  }),
}))

vi.mock('../../src/db/queries.js', () => ({
  getWinningClaim: mocks.getWinningClaim,
  putPost: mocks.putPost,
  updatePost: mocks.updatePost,
}))

import { usePost } from '../../src/composables/usePost.js'

describe('usePost chunked popup recovery', () => {
  beforeEach(() => {
    mocks.auth.isLoggedIn = true
    mocks.auth.address = 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD'
    mocks.auth.username = 'maestro'
    mocks.auth.loadProfile.mockReset().mockResolvedValue(undefined)
    mocks.signTransaction.mockReset()
    mocks.sendRawTransaction.mockReset().mockResolvedValue('txhash')
    mocks.startDeltaSync.mockReset().mockResolvedValue(undefined)
    mocks.getWinningClaim.mockReset().mockResolvedValue(null)
    mocks.putPost.mockReset().mockResolvedValue(undefined)
    mocks.updatePost.mockReset().mockResolvedValue(undefined)
    mocks.assertBinaryTransactionsSupported.mockReset()
    mocks.isNimiqPay.value = false
    mocks.sendMiniAppTransaction.mockReset().mockResolvedValue('pay-txhash')
  })

  it('resumes chunk signing after popup was blocked', async () => {
    const popupErr = new Error('Failed to open popup')
    mocks.signTransaction
      .mockResolvedValueOnce({ serializedTx: 'startTx' }) // POST_START
      .mockRejectedValueOnce(popupErr) // first chunk blocked
      .mockResolvedValue({ serializedTx: 'chunkTx' }) // resume

    const { submitPost, signingActive, signingLabel } = usePost()
    const longText =
      'This is a long message that should require chunking and continue signing when popup is blocked by the browser.'

    await expect(submitPost(longText)).rejects.toThrow('Popup blocked on chunk')
    expect(signingActive.value).toBe(true)
    expect(signingLabel.value).toContain('Click Post to continue')
    expect(mocks.putPost).toHaveBeenCalledTimes(1)
    expect(mocks.sendRawTransaction).toHaveBeenCalledTimes(1) // only start tx sent so far

    await expect(submitPost(longText)).resolves.toBeUndefined()
    expect(mocks.putPost).toHaveBeenCalledTimes(1) // no duplicate start row
    expect(mocks.sendRawTransaction.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mocks.startDeltaSync).toHaveBeenCalledTimes(1)
  })

  it('posts through the native Nimiq Pay provider', async () => {
    mocks.isNimiqPay.value = true
    const { submitPost } = usePost()
    await expect(submitPost('Hello Pay')).resolves.toBeUndefined()
    expect(mocks.sendMiniAppTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('uses smaller chunks for Nimiq Pay text transactions', async () => {
    mocks.isNimiqPay.value = true
    const { submitPost } = usePost()

    await expect(submitPost('This post exceeds seventeen bytes.')).resolves.toBeUndefined()

    expect(mocks.sendMiniAppTransaction.mock.calls.length).toBeGreaterThan(1)
    expect(mocks.signTransaction).not.toHaveBeenCalled()
  })

  it('blocks new chunked draft while another pending upload exists', async () => {
    const popupErr = new Error('Failed to open popup')
    mocks.signTransaction
      .mockResolvedValueOnce({ serializedTx: 'startTx' }) // POST_START
      .mockRejectedValueOnce(popupErr) // first chunk blocked

    const { submitPost } = usePost()
    const firstText =
      'This first long message creates a chunk session and then gets blocked during the first chunk popup.'
    const otherText =
      'Another long message that should be rejected while the previous chunk session is still pending.'

    await expect(submitPost(firstText)).rejects.toThrow('Popup blocked on chunk')
    await expect(submitPost(otherText)).rejects.toThrow('unfinished chunked post')
    expect(mocks.putPost).toHaveBeenCalledTimes(1)
  })
})
