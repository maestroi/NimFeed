import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  startDeltaSync: vi.fn(),
  syncDerivedAddress: vi.fn(),
  getCatalogRefs: vi.fn(),
  getCatalogRefsBySender: vi.fn(),
  getFollowees: vi.fn(),
  getPost: vi.fn(),
}))

vi.mock('../../src/indexer/useIndexer.js', () => ({
  useIndexer: () => ({
    startDeltaSync: mocks.startDeltaSync,
    indexer: { syncDerivedAddress: mocks.syncDerivedAddress },
  }),
}))

vi.mock('../../src/db/queries.js', () => ({
  getCatalogRefs: mocks.getCatalogRefs,
  getCatalogRefsBySender: mocks.getCatalogRefsBySender,
  getFollowees: mocks.getFollowees,
  getPost: mocks.getPost,
}))

import { useFeed } from '../../src/composables/useFeed.js'
import { useAuthStore } from '../../src/stores/auth.js'

describe('useFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.startDeltaSync.mockReset().mockResolvedValue(undefined)
    mocks.syncDerivedAddress.mockReset().mockResolvedValue(undefined)
    mocks.getCatalogRefs.mockReset().mockResolvedValue([])
    mocks.getCatalogRefsBySender.mockReset().mockResolvedValue([])
    mocks.getFollowees.mockReset().mockResolvedValue([])
    mocks.getPost.mockReset().mockResolvedValue(undefined)
  })

  it('global refresh loads catalog-backed posts', async () => {
    const sender = 'NQ01 AUTHOR0000000000000000000000'
    mocks.getCatalogRefs.mockResolvedValue([
      { type: 'POST_INLINE', sender, post_id: 'abc', block_height: 10, tx_index: 0 },
    ])
    mocks.getPost.mockResolvedValue({ author: sender, post_id: 'abc', status: 'inline', content: 'hi' })

    const feed = useFeed('global')
    await feed.refresh()

    expect(mocks.startDeltaSync).toHaveBeenCalled()
    expect(feed.posts.value).toHaveLength(1)
    expect(feed.posts.value[0].content).toBe('hi')
  })

  it('following refresh merges catalog refs from followees (Phase 2)', async () => {
    const a = 'NQ01 ALICE00000000000000000000000'
    const b = 'NQ01 BOBBB00000000000000000000000'
    const auth = useAuthStore()
    auth.setAddress('NQ01 VIEWER000000000000000000000')

    mocks.getFollowees.mockResolvedValue([a, b])
    mocks.getCatalogRefsBySender.mockImplementation(async (sender) =>
      sender === a
        ? [{ type: 'POST_INLINE', sender: a, post_id: 'p1', block_height: 5, tx_index: 0 }]
        : [{ type: 'POST_INLINE', sender: b, post_id: 'p2', block_height: 10, tx_index: 0 }],
    )

    mocks.getPost.mockImplementation(async (author, postId) =>
      Promise.resolve({
        author,
        post_id: postId,
        status: 'inline',
        content: `${author}:${postId}`,
      }),
    )

    const feed = useFeed('following')
    await feed.refresh()

    expect(mocks.startDeltaSync).toHaveBeenCalled()
    expect(mocks.getCatalogRefsBySender).toHaveBeenCalled()
    expect(feed.posts.value.map((p) => p.post_id)).toEqual(['p2', 'p1'])
  })
})
