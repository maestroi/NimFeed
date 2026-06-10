import { ref, watch, onMounted } from 'vue'
import { useHub } from '../chain/hub.js'
import { getWalletRuntime } from '../chain/walletRuntime.js'
import { rpc } from '../chain/rpc.js'
import { buildFollow, buildUnfollow } from '../protocol/encoder.js'
import { nqToAddressBytes } from '../protocol/utils.js'
import { TX_VALUE_LUNA, FOLLOW_CATALOG_ADDRESS } from '../protocol/constants.js'
import { isFollowing as dbIsFollowing, getFollowCounts } from '../db/queries.js'
import { useAuthStore } from '../stores/auth.js'
import { useIndexer } from '../indexer/useIndexer.js'

export function useFollow(targetAddress) {
  const auth = useAuthStore()
  const hub = useHub()
  const walletRuntime = getWalletRuntime()
  const { startDeltaSync } = useIndexer()
  const active = ref(false)
  const counts = ref({ following: 0, followers: 0 })
  const pending = ref(false)

  async function refresh() {
    if (!targetAddress) return
    const addr = typeof targetAddress === 'object' ? targetAddress.value : targetAddress
    if (!addr) return
    counts.value = await getFollowCounts(addr)
    if (auth.isLoggedIn) {
      active.value = await dbIsFollowing(auth.address, addr)
    }
  }

  async function sendFollowTx(isFollow) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const addr = typeof targetAddress === 'object' ? targetAddress.value : targetAddress
    const targetBytes = nqToAddressBytes(addr)
    const payload = isFollow ? buildFollow(targetBytes) : buildUnfollow(targetBytes)

    if (walletRuntime.isNimiqPay.value) {
      await walletRuntime.sendMiniAppTransaction({
        recipient: FOLLOW_CATALOG_ADDRESS,
        value: TX_VALUE_LUNA,
        fee: 0,
        extraData: payload,
      })
    } else {
      walletRuntime.assertBinaryTransactionsSupported()
      const height = await rpc.getBlockNumber()

      const signed = await hub.signTransaction({
        sender: auth.address,
        recipient: FOLLOW_CATALOG_ADDRESS,
        value: TX_VALUE_LUNA,
        fee: 0,
        extraData: payload,
        validityStartHeight: height,
      })
      await rpc.sendRawTransaction(signed.serializedTx)
    }
    await startDeltaSync()
  }

  async function follow() {
    if (pending.value) return
    pending.value = true
    try {
      await sendFollowTx(true)
      await refresh()
    } finally {
      pending.value = false
    }
  }

  async function unfollow() {
    if (pending.value) return
    pending.value = true
    try {
      await sendFollowTx(false)
      await refresh()
    } finally {
      pending.value = false
    }
  }

  if (typeof targetAddress === 'object' && targetAddress?.value !== undefined) {
    watch(targetAddress, refresh, { immediate: true })
  } else {
    onMounted(refresh)
  }

  return { active, counts, pending, follow, unfollow, refresh }
}
