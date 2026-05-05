import { ref, watch } from 'vue'
import { getUser, getCatalogRefsBySender, getPost } from '../db/queries.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { canonicalNqAddress } from '../protocol/address.js'

export function useProfile(address) {
  const { startDeltaSync } = useIndexer()
  const user = ref(null)
  const posts = ref([])
  const loading = ref(false)

  async function load(addr) {
    if (!addr) return
    const key = canonicalNqAddress(addr)
    loading.value = true
    try {
      await startDeltaSync()
      user.value = await getUser(key)
      const refs = await getCatalogRefsBySender(key, ['POST_INLINE', 'POST_START'])
      const resolved = await Promise.all(refs.map((r) => getPost(key, r.post_id)))
      posts.value = resolved
        .filter((p) => p && (p.status === 'complete' || p.status === 'inline'))
        .sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)
    } finally {
      loading.value = false
    }
  }

  if (typeof address === 'object' && address?.value !== undefined) {
    watch(address, (addr) => load(addr), { immediate: true })
  } else {
    load(address)
  }

  return { user, posts, loading, load }
}
