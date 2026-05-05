import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: {
    isLoggedIn: true,
    address: 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD',
    username: null,
    loadProfile: vi.fn(),
  },
  signTransaction: vi.fn(),
  sendRawTransaction: vi.fn(),
  startDeltaSync: vi.fn(),
  getWinningClaim: vi.fn(),
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

vi.mock('../../src/indexer/useIndexer.js', () => ({
  useIndexer: () => ({
    startDeltaSync: mocks.startDeltaSync,
  }),
}))

vi.mock('../../src/db/queries.js', () => ({
  getWinningClaim: mocks.getWinningClaim,
  putPost: vi.fn(),
  updatePost: vi.fn(),
}))

import { usePost } from '../../src/composables/usePost.js'

describe('usePost.claimProfile', () => {
  beforeEach(() => {
    mocks.auth.isLoggedIn = true
    mocks.auth.address = 'NQ17 VERV F3MQ 283T NRSR FPJG 55BJ PMHC N8MD'
    mocks.auth.username = null
    mocks.auth.loadProfile.mockReset().mockResolvedValue(undefined)

    mocks.signTransaction.mockReset().mockResolvedValue({ serializedTx: 'abcd' })
    mocks.sendRawTransaction.mockReset().mockResolvedValue('txhash1')
    mocks.startDeltaSync.mockReset().mockResolvedValue(undefined)
    mocks.getWinningClaim.mockReset().mockResolvedValue(null)
  })

  it('rejects when user is not logged in', async () => {
    mocks.auth.isLoggedIn = false
    const { claimProfile } = usePost()
    await expect(claimProfile('maestro', 'Maestro')).rejects.toThrow('Not logged in')
    expect(mocks.signTransaction).not.toHaveBeenCalled()
  })

  it('rejects before signing if username is already taken by another address', async () => {
    mocks.getWinningClaim.mockResolvedValue({
      username: 'maestro',
      address: 'NQ99 OTHER 0000 0000 0000 0000 0000 0000 0000',
    })

    const { claimProfile } = usePost()
    await expect(claimProfile('maestro', 'Maestro')).rejects.toThrow('@maestro is already taken.')
    expect(mocks.signTransaction).not.toHaveBeenCalled()
    expect(mocks.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('succeeds when username is available and profile wins claim', async () => {
    mocks.auth.loadProfile.mockImplementation(async () => {
      mocks.auth.username = 'maestro'
    })

    const { claimProfile } = usePost()
    await expect(claimProfile('maestro', 'Maestro')).resolves.toBeUndefined()

    expect(mocks.signTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.startDeltaSync).toHaveBeenCalledTimes(1)
    expect(mocks.auth.loadProfile).toHaveBeenCalledTimes(1)
  })

  it('reports taken username if race is lost after sending claim', async () => {
    mocks.getWinningClaim
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        username: 'maestro',
        address: 'NQ99 OTHER 0000 0000 0000 0000 0000 0000 0000',
      })

    const { claimProfile } = usePost()
    await expect(claimProfile('maestro', 'Maestro')).rejects.toThrow('@maestro is already taken.')

    expect(mocks.signTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.startDeltaSync).toHaveBeenCalledTimes(1)
    expect(mocks.auth.loadProfile).toHaveBeenCalledTimes(1)
  })
})
