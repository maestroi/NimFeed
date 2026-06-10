import { ref } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useHub } from '../chain/hub.js'
import { getWalletRuntime } from '../chain/walletRuntime.js'
import { rpc } from '../chain/rpc.js'
import { LUNA_PER_NIM } from '../protocol/constants.js'

export function useDonate(recipientAddress) {
  const auth = useAuthStore()
  const hub = useHub()
  const walletRuntime = getWalletRuntime()
  const pending = ref(false)
  const error = ref(null)

  async function sendTip(amountNim) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const valueLuna = Math.round(Number(amountNim) * LUNA_PER_NIM)
    if (!Number.isFinite(valueLuna) || valueLuna <= 0) {
      throw new Error('Enter a valid amount')
    }

    if (walletRuntime.isNimiqPay.value) {
      await walletRuntime.sendMiniAppTransaction({
        recipient: recipientAddress,
        value: valueLuna,
        fee: 0,
      })
    } else {
      walletRuntime.assertBinaryTransactionsSupported()
      const height = await rpc.getBlockNumber()
      const signed = await hub.signTransaction({
        sender: auth.address,
        recipient: recipientAddress,
        value: valueLuna,
        fee: 0,
        validityStartHeight: height,
      })
      await rpc.sendRawTransaction(signed.serializedTx)
    }
  }

  async function tip(amountNim) {
    if (pending.value) return
    pending.value = true
    error.value = null
    try {
      await sendTip(amountNim)
    } catch (e) {
      error.value = e?.message || 'Failed to send tip'
      throw e
    } finally {
      pending.value = false
    }
  }

  return { pending, error, tip }
}
