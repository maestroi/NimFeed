import { ref } from 'vue'
import { useIndexer } from '../indexer/useIndexer.js'
import { getCatalogRefs, getCatalogRefsBySender, getPost, getFollowees, updatePost } from '../db/queries.js'
import { FEED_PAGE_SIZE, MISSING_CHUNKS_BLOCK_WINDOW } from '../protocol/constants.js'
import { useAuthStore } from '../stores/auth.js'
import { addressBytesToNq, derivePostAddress, nqToAddressBytes } from '../protocol/address.js'
import { hexToPostIdBytes } from '../protocol/utils.js'
import { isDebugLogsEnabled } from '../debug/logging.js'

function debug(mode, step, data = {}) {
  if (!isDebugLogsEnabled()) return
  console.info(`[NimFeed debug][feed:${mode}] ${step}`, data)
}

function triggerDerivedSync(ref, indexer) {
  Promise.resolve()
    .then(async () => {
      const authorBytes = nqToAddressBytes(ref.sender)
      const postIdBytes = hexToPostIdBytes(ref.post_id)
      const derivedBytes = await derivePostAddress(authorBytes, postIdBytes)
      const derivedNq = addressBytesToNq(derivedBytes)
      return indexer.syncDerivedAddress(derivedNq)
    })
    .catch(() => {})
}

function skeletonPost(ref, status) {
  return {
    author: ref.sender,
    post_id: ref.post_id,
    status,
    block_height: ref.block_height,
    content: null,
    _skeleton: true,
  }
}

/** @param {'global' | 'following'} mode */
export function useFeed(mode = 'global') {
  const { startDeltaSync, indexer } = useIndexer()
  const auth = useAuthStore()
  const posts = ref([])
  const loading = ref(false)
  const hasMore = ref(true)
  const cursor = ref({ block_height: Number.POSITIVE_INFINITY, tx_index: Number.POSITIVE_INFINITY })
  const followingOffset = ref(0)
  let queue = Promise.resolve()

  function serialize(task) {
    queue = queue.then(task, task)
    return queue
  }

  function clear() {
    posts.value = []
    hasMore.value = true
  }

  function append(more) {
    posts.value = [...posts.value, ...more].slice(0, 50)
  }

  async function resolvePosts(refs) {
    const t0 = performance.now()
    const latestHeight = refs[0]?.block_height ?? 0
    debug(mode, 'resolvePosts:start', { refs: refs.length })
    return Promise.all(
      refs.map(async (ref) => {
        const meta = { type: ref.type, sender: ref.sender, postId: ref.post_id }
        if (ref.type === 'POST_INLINE') {
          const post = await getPost(ref.sender, ref.post_id)
          debug(mode, 'resolvePosts:inline', { ...meta, hit: !!post, status: post?.status ?? null })
          return post ?? skeletonPost(ref, 'inline')
        }
        const post = await getPost(ref.sender, ref.post_id)
        if (!post) {
          debug(mode, 'resolvePosts:chunked-miss', meta)
          triggerDerivedSync(ref, indexer)
          return skeletonPost(ref, 'pending')
        }
        if (
          post.status === 'pending' &&
          post.total_chunks != null &&
          (post.chunks_received ?? 0) < post.total_chunks &&
          post.block_height > 0 &&
          latestHeight - post.block_height >= MISSING_CHUNKS_BLOCK_WINDOW
        ) {
          await updatePost(post.author, post.post_id, { status: 'missing_chunks' })
          const next = { ...post, status: 'missing_chunks' }
          debug(mode, 'resolvePosts:chunked-stale', {
            ...meta,
            latestHeight,
            postHeight: post.block_height,
            totalChunks: post.total_chunks,
            chunksReceived: post.chunks_received ?? 0,
          })
          return next
        }
        debug(mode, 'resolvePosts:chunked-hit', { ...meta, status: post.status })
        return post
      }),
    ).finally(() => {
      debug(mode, 'resolvePosts:done', { refs: refs.length, ms: Math.round(performance.now() - t0) })
    })
  }

  async function loadGlobalPage() {
    loading.value = true
    const t0 = performance.now()
    debug(mode, 'loadGlobalPage:start', { cursor: cursor.value, existingPosts: posts.value.length })
    try {
      const refs = await getCatalogRefs(['POST_INLINE', 'POST_START'], {
        limit: FEED_PAGE_SIZE,
        beforeHeight: cursor.value.block_height,
        beforeTxIndex: cursor.value.tx_index,
      })
      debug(mode, 'loadGlobalPage:refs', { refs: refs.length })

      const resolved = await resolvePosts(refs)

      if (refs.length) {
        const last = refs[refs.length - 1]
        cursor.value = { block_height: last.block_height, tx_index: last.tx_index }
      }

      append(resolved)
      hasMore.value = refs.length === FEED_PAGE_SIZE
      debug(mode, 'loadGlobalPage:done', {
        resolved: resolved.length,
        hasMore: hasMore.value,
        totalPosts: posts.value.length,
        ms: Math.round(performance.now() - t0),
      })
    } catch (err) {
      debug(mode, 'loadGlobalPage:error', { message: err?.message ?? String(err) })
      throw err
    } finally {
      loading.value = false
    }
  }

  /** Following timeline from catalog_refs only (Phase 2) — merged across active followees, then paginated. */
  async function loadFollowingPage(reset = false) {
    if (!auth.isLoggedIn) return
    loading.value = true
    const t0 = performance.now()
    debug(mode, 'loadFollowingPage:start', { reset, offset: followingOffset.value, existingPosts: posts.value.length })
    try {
      const followees = await getFollowees(auth.address)
      debug(mode, 'loadFollowingPage:followees', { count: followees.length })
      const allArrays = await Promise.all(
        followees.map((addr) => getCatalogRefsBySender(addr, ['POST_INLINE', 'POST_START'])),
      )
      const allRefs = allArrays
        .flat()
        .sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)

      if (reset) {
        followingOffset.value = 0
        clear()
      }

      const cutoff = followingOffset.value
      const page = allRefs.slice(cutoff, cutoff + FEED_PAGE_SIZE)
      followingOffset.value = cutoff + page.length

      const resolved = await resolvePosts(page)

      append(resolved)
      hasMore.value = followingOffset.value < allRefs.length
      debug(mode, 'loadFollowingPage:done', {
        page: page.length,
        resolved: resolved.length,
        totalRefs: allRefs.length,
        hasMore: hasMore.value,
        totalPosts: posts.value.length,
        ms: Math.round(performance.now() - t0),
      })
    } catch (err) {
      debug(mode, 'loadFollowingPage:error', { message: err?.message ?? String(err) })
      throw err
    } finally {
      loading.value = false
    }
  }

  async function refreshGlobal() {
    const t0 = performance.now()
    debug(mode, 'refreshGlobal:start')
    loading.value = true
    try {
      await startDeltaSync()
      debug(mode, 'refreshGlobal:deltaSyncDone', { ms: Math.round(performance.now() - t0) })
      await reloadGlobal()
    } catch (err) {
      loading.value = false
      throw err
    }
  }

  async function refreshFollowing() {
    if (!auth.isLoggedIn) return
    const t0 = performance.now()
    debug(mode, 'refreshFollowing:start')
    loading.value = true
    try {
      await startDeltaSync()
      debug(mode, 'refreshFollowing:deltaSyncDone', { ms: Math.round(performance.now() - t0) })
      await reloadFollowing()
    } catch (err) {
      loading.value = false
      throw err
    }
  }

  async function reloadGlobal() {
    debug(mode, 'reloadGlobal:start')
    clear()
    cursor.value = { block_height: Number.POSITIVE_INFINITY, tx_index: Number.POSITIVE_INFINITY }
    followingOffset.value = 0
    await loadGlobalPage()
  }

  async function reloadFollowing() {
    if (!auth.isLoggedIn) {
      clear()
      return
    }
    debug(mode, 'reloadFollowing:start')
    await loadFollowingPage(true)
  }

  async function refresh() {
    debug(mode, 'refresh:queued')
    return serialize(async () => {
      debug(mode, 'refresh:run')
      return mode === 'following' ? refreshFollowing() : refreshGlobal()
    })
  }

  async function loadPage() {
    debug(mode, 'loadPage:queued')
    return serialize(async () => {
      debug(mode, 'loadPage:run')
      return mode === 'following' ? loadFollowingPage(false) : loadGlobalPage()
    })
  }

  async function reload() {
    debug(mode, 'reload:queued')
    return serialize(async () => {
      debug(mode, 'reload:run')
      return mode === 'following' ? reloadFollowing() : reloadGlobal()
    })
  }

  return { posts, loading, hasMore, loadPage, refresh, reload }
}
