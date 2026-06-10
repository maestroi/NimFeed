import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertBinaryTransactionsSupported: vi.fn(),
  signTransaction: vi.fn(),
  sendRawTransaction: vi.fn(),
  startDeltaSync: vi.fn(),
  isNimiqPay: { value: false },
  sendMiniAppTransaction: vi.fn(),
}))

vi.mock('../../src/stores/auth.js', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    address: 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD',
  }),
}))

vi.mock('../../src/chain/walletRuntime.js', () => ({
  getWalletRuntime: () => ({
    assertBinaryTransactionsSupported: mocks.assertBinaryTransactionsSupported,
    isNimiqPay: mocks.isNimiqPay,
    sendMiniAppTransaction: mocks.sendMiniAppTransaction,
  }),
}))

vi.mock('../../src/chain/hub.js', () => ({
  useHub: () => ({ signTransaction: mocks.signTransaction }),
}))

vi.mock('../../src/chain/rpc.js', () => ({
  rpc: {
    getBlockNumber: vi.fn().mockResolvedValue(123),
    sendRawTransaction: mocks.sendRawTransaction,
  },
}))

vi.mock('../../src/indexer/useIndexer.js', () => ({
  useIndexer: () => ({ startDeltaSync: mocks.startDeltaSync }),
}))

vi.mock('../../src/db/queries.js', () => ({
  isFollowing: vi.fn().mockResolvedValue(false),
  getFollowCounts: vi.fn().mockResolvedValue({ following: 0, followers: 0 }),
}))

import { useFollow } from '../../src/composables/useFollow.js'

describe('useFollow wallet runtime', () => {
  beforeEach(() => {
    mocks.assertBinaryTransactionsSupported.mockReset()
    mocks.signTransaction.mockReset()
    mocks.sendRawTransaction.mockReset()
    mocks.startDeltaSync.mockReset()
    mocks.isNimiqPay.value = false
    mocks.sendMiniAppTransaction.mockReset()
  })

  it.each(['follow', 'unfollow'])('rejects %s before signing when binary writes are unavailable', async (action) => {
    mocks.assertBinaryTransactionsSupported.mockImplementation(() => {
      throw new Error('Binary writes unavailable')
    })

    const follow = useFollow('NQ15 7A2M 7AN6 6M1M LKGU 3Q5B 2JLK VJ7N 4YH0')
    await expect(follow[action]()).rejects.toThrow('Binary writes unavailable')
    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled()
  })

  it.each(['follow', 'unfollow'])('sends %s through the native Nimiq Pay provider', async (action) => {
    mocks.isNimiqPay.value = true
    mocks.sendMiniAppTransaction.mockResolvedValue('pay-tx-hash')

    const follow = useFollow('NQ15 7A2M 7AN6 6M1M LKGU 3Q5B 2JLK VJ7N 4YH0')
    await follow[action]()

    expect(mocks.assertBinaryTransactionsSupported).not.toHaveBeenCalled()
    expect(mocks.sendMiniAppTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled()
  })
})
