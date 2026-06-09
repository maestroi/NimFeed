import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BINARY_TRANSACTIONS_UNSUPPORTED,
  createWalletRuntime,
} from '../../src/chain/walletRuntime.js'

describe('wallet runtime', () => {
  let hub

  beforeEach(() => {
    hub = {
      signMessage: vi.fn().mockResolvedValue({ signer: 'NQ00 HUB ACCOUNT' }),
    }
  })

  it('selects Nimiq Pay when the injected provider initializes', async () => {
    const provider = { listAccounts: vi.fn() }
    const initMiniApp = vi.fn().mockResolvedValue(provider)
    const runtime = createWalletRuntime({ initMiniApp, hub })

    await runtime.initialize()

    expect(initMiniApp).toHaveBeenCalledWith({ timeout: 10_000 })
    expect(runtime.kind.value).toBe('nimiq-pay')
    expect(runtime.canWriteBinaryTransactions.value).toBe(false)
  })

  it('falls back to Hub when the injected provider does not initialize', async () => {
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockRejectedValue(new Error('Timed out')),
      hub,
    })

    await runtime.initialize()

    expect(runtime.kind.value).toBe('browser')
    expect(runtime.canWriteBinaryTransactions.value).toBe(true)
  })

  it('connects through Nimiq Pay and returns the first shared account', async () => {
    const provider = {
      listAccounts: vi.fn().mockResolvedValue(['NQ00 PAY ACCOUNT', 'NQ00 SECOND ACCOUNT']),
    }
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
    })

    expect(await runtime.connect()).toBe('NQ00 PAY ACCOUNT')
    expect(hub.signMessage).not.toHaveBeenCalled()
  })

  it('sends text-enveloped post transactions through Nimiq Pay', async () => {
    const provider = {
      sendBasicTransactionWithData: vi.fn().mockResolvedValue('pay-tx-hash'),
    }
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
    })

    const hash = await runtime.sendMiniAppTransaction({
      recipient: 'NQ00 RECIPIENT',
      value: 1,
      fee: 0,
      extraData: new Uint8Array([0x4e, 0x46, 0x01, 0x02, 0x01]),
    })

    expect(hash).toBe('pay-tx-hash')
    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: 'NQ00 RECIPIENT',
      value: 1,
      fee: 0,
      data: 'NFH:4e46010201',
    })
  })

  it('normalizes Nimiq Pay transaction errors', async () => {
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue({
        sendBasicTransactionWithData: vi.fn().mockResolvedValue({
          error: { message: 'Transaction rejected' },
        }),
      }),
      hub,
    })

    await expect(
      runtime.sendMiniAppTransaction({
        recipient: 'NQ00 RECIPIENT',
        value: 1,
        extraData: new Uint8Array([0x4e, 0x46, 0x01, 0x02]),
      }),
    ).rejects.toThrow('Transaction rejected')
  })

  it('does not proxy injected providers that use private fields', async () => {
    class PrivateProvider {
      #accounts = ['NQ00 PRIVATE ACCOUNT']

      listAccounts() {
        return this.#accounts
      }
    }

    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(new PrivateProvider()),
      hub,
    })

    await expect(runtime.connect()).resolves.toBe('NQ00 PRIVATE ACCOUNT')
  })

  it('normalizes provider errors and empty account lists', async () => {
    const provider = {
      listAccounts: vi
        .fn()
        .mockResolvedValueOnce({ error: { message: 'Sharing rejected' } })
        .mockResolvedValueOnce([]),
    }
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
    })

    await expect(runtime.connect()).rejects.toThrow('Sharing rejected')
    await expect(runtime.connect()).rejects.toThrow('No Nimiq Pay account was shared.')
  })

  it('connects through Hub in a browser', async () => {
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockRejectedValue(new Error('Timed out')),
      hub,
    })

    expect(await runtime.connect('NQ00 EXISTING')).toBe('NQ00 HUB ACCOUNT')
    expect(hub.signMessage).toHaveBeenCalledWith('Login to NimFeed', 'NQ00 EXISTING')
  })

  it('rejects binary protocol writes inside Nimiq Pay', async () => {
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue({ listAccounts: vi.fn() }),
      hub,
    })

    await runtime.initialize()

    expect(() => runtime.assertBinaryTransactionsSupported()).toThrow(
      BINARY_TRANSACTIONS_UNSUPPORTED,
    )
  })

  it('allows account connection inside Nimiq Pay', async () => {
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue({ listAccounts: vi.fn() }),
      hub,
    })

    await runtime.initialize()

    expect(runtime.canConnect.value).toBe(true)
  })

  it('rejects binary protocol writes while runtime detection is pending', () => {
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn(),
      hub,
    })

    expect(runtime.canWriteBinaryTransactions.value).toBe(false)
    expect(() => runtime.assertBinaryTransactionsSupported()).toThrow(
      'Wallet runtime is still initializing. Please try again.',
    )
  })
})
