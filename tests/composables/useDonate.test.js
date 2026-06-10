import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertBinaryTransactionsSupported: vi.fn(),
  signTransaction: vi.fn(),
  sendRawTransaction: vi.fn(),
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

import { useDonate } from '../../src/composables/useDonate.js'

const RECIPIENT = 'NQ15 7A2M 7AN6 6M1M LKGU 3Q5B 2JLK VJ7N 4YH0'

describe('useDonate', () => {
  beforeEach(() => {
    mocks.assertBinaryTransactionsSupported.mockReset()
    mocks.signTransaction.mockReset()
    mocks.sendRawTransaction.mockReset()
    mocks.isNimiqPay.value = false
    mocks.sendMiniAppTransaction.mockReset()
  })

  it('sends a tip through the Hub, converting NIM to luna', async () => {
    mocks.signTransaction.mockResolvedValue({ serializedTx: 'serialized' })
    mocks.sendRawTransaction.mockResolvedValue('tx-hash')

    const { tip, error } = useDonate(RECIPIENT)
    await tip(5)

    expect(mocks.assertBinaryTransactionsSupported).toHaveBeenCalled()
    expect(mocks.signTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: RECIPIENT,
        value: 500000,
        fee: 0,
      }),
    )
    expect(mocks.sendRawTransaction).toHaveBeenCalledWith('serialized')
    expect(error.value).toBeNull()
  })

  it('sends a tip through the native Nimiq Pay provider', async () => {
    mocks.isNimiqPay.value = true
    mocks.sendMiniAppTransaction.mockResolvedValue('pay-tx-hash')

    const { tip, error } = useDonate(RECIPIENT)
    await tip(10)

    expect(mocks.assertBinaryTransactionsSupported).not.toHaveBeenCalled()
    expect(mocks.sendMiniAppTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: RECIPIENT,
        value: 1000000,
        fee: 0,
      }),
    )
    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled()
    expect(error.value).toBeNull()
  })

  it('rejects invalid amounts before signing', async () => {
    const { tip, error } = useDonate(RECIPIENT)
    await expect(tip(0)).rejects.toThrow('Enter a valid amount')

    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(mocks.sendMiniAppTransaction).not.toHaveBeenCalled()
    expect(error.value).toBe('Enter a valid amount')
  })

  it('rejects when binary writes are unavailable and not in Nimiq Pay', async () => {
    mocks.assertBinaryTransactionsSupported.mockImplementation(() => {
      throw new Error('Binary writes unavailable')
    })

    const { tip, error } = useDonate(RECIPIENT)
    await expect(tip(5)).rejects.toThrow('Binary writes unavailable')

    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(error.value).toBe('Binary writes unavailable')
  })
})
