import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BINARY_TRANSACTIONS_UNSUPPORTED,
  createWalletRuntime,
} from '../../src/chain/walletRuntime.js'
import { canonicalNqAddress } from '../../src/protocol/address.js'

const SIGNING_MAP_KEY = 'nimfeed_pay_signing_map'

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

  it('uses the Nimiq Pay signing account as the connected identity', async () => {
    const provider = {
      listAccounts: vi.fn().mockResolvedValue(['NQ10 SHARED ACCOUNT']),
      sign: vi.fn().mockResolvedValue({ publicKey: 'signed-public-key', signature: 'signature' }),
    }
    const derivePublicKeyAddress = vi.fn().mockResolvedValue('NQ11 SIGNING ACCOUNT')
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
      derivePublicKeyAddress,
    })

    await expect(runtime.connect()).resolves.toBe('NQ11 SIGNING ACCOUNT')
    expect(provider.sign).toHaveBeenCalledWith('Login to NimFeed')
    expect(derivePublicKeyAddress).toHaveBeenCalledWith('signed-public-key')
  })

  it('exposes the custodial Nimiq Pay account so callers can key a signing-address cache', async () => {
    const provider = {
      listAccounts: vi.fn().mockResolvedValue(['NQ10 SHARED ACCOUNT']),
    }
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
    })

    await runtime.connect()

    expect(runtime.custodialAddress.value).toBe('NQ10 SHARED ACCOUNT')
  })

  it('prefers a previously learned signing address over the address derived from sign()', async () => {
    const custodial = 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD'
    const learnedSigner = 'NQ11 MTAV XXM6 SRTB 92NX EDKY XL8F S832 FA14'
    localStorage.setItem(
      SIGNING_MAP_KEY,
      JSON.stringify({ [canonicalNqAddress(custodial)]: canonicalNqAddress(learnedSigner) }),
    )

    const provider = {
      listAccounts: vi.fn().mockResolvedValue([custodial]),
      sign: vi.fn().mockResolvedValue({ publicKey: '00'.repeat(32), signature: 'signature' }),
    }
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
    })

    try {
      await expect(runtime.connect()).resolves.toBe(canonicalNqAddress(learnedSigner))
    } finally {
      localStorage.removeItem(SIGNING_MAP_KEY)
    }
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

  it('sends plain value transactions through Nimiq Pay without a data envelope', async () => {
    const provider = {
      sendBasicTransactionWithData: vi.fn().mockResolvedValue('pay-tx-hash'),
    }
    const runtime = createWalletRuntime({
      initMiniApp: vi.fn().mockResolvedValue(provider),
      hub,
    })

    const hash = await runtime.sendMiniAppTransaction({
      recipient: 'NQ00 RECIPIENT',
      value: 500000,
      fee: 0,
    })

    expect(hash).toBe('pay-tx-hash')
    expect(provider.sendBasicTransactionWithData).toHaveBeenCalledWith({
      recipient: 'NQ00 RECIPIENT',
      value: 500000,
      fee: 0,
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
