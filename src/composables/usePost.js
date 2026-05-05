import { ref } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useHub } from '../chain/hub.js'
import { rpc } from '../chain/rpc.js'
import {
  buildProfileClaim,
  buildPostInline,
  buildPostStart,
  buildPostChunk,
  splitInto50ByteChunks,
} from '../protocol/encoder.js'
import { generatePostId, postIdToHex, hexToPostIdBytes } from '../protocol/utils.js'
import { nqToAddressBytes, addressBytesToNq, derivePostAddress } from '../protocol/address.js'
import { deflateRaw, shouldCompress } from '../protocol/compression.js'
import {
  POST_CATALOG_ADDRESS,
  TX_VALUE_LUNA,
  INLINE_MAX_NO_REPLY,
  INLINE_MAX_WITH_REPLY,
  MAX_POST_CHARS,
} from '../protocol/constants.js'
import { getWinningClaim, putPost, updatePost } from '../db/queries.js'
import { useIndexer } from '../indexer/useIndexer.js'

function sameAddress(a, b) {
  return String(a || '').replace(/\s+/g, '').toUpperCase() === String(b || '').replace(/\s+/g, '').toUpperCase()
}

export function usePost() {
  const auth = useAuthStore()
  const hub = useHub()
  const { startDeltaSync } = useIndexer()
  const sending = ref(false)
  const error = ref(null)
  const signingActive = ref(false)
  const signingStep = ref(0)
  const signingTotal = ref(0)
  const signingLabel = ref('')

  async function claimProfile(username, displayName) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const currentWinner = await getWinningClaim(username)
    if (currentWinner?.address && !sameAddress(currentWinner.address, auth.address)) {
      throw new Error(`@${username} is already taken.`)
    }

    const payload = buildProfileClaim(username, displayName)
    const signed = await hub.signTransaction({
      sender: auth.address,
      recipient: POST_CATALOG_ADDRESS,
      value: TX_VALUE_LUNA,
      fee: 0,
      extraData: payload,
    })
    await rpc.sendRawTransaction(signed.serializedTx)
    await startDeltaSync()
    await auth.loadProfile()
    if (auth.username !== username) {
      const winnerAfter = await getWinningClaim(username)
      if (winnerAfter?.address && !sameAddress(winnerAfter.address, auth.address)) {
        throw new Error(`@${username} is already taken.`)
      }
      throw new Error('Claim sent, but username is not confirmed yet. Please refresh and try again.')
    }
  }

  function txCount(text, isReply) {
    const raw = new TextEncoder().encode(text)
    const limit = isReply ? INLINE_MAX_WITH_REPLY : INLINE_MAX_NO_REPLY
    if (raw.length <= limit) return 1
    const chunks = Math.ceil(raw.length / 50) + 1
    return 1 + chunks
  }

  async function submitPost(text, { replyToAuthor = null, replyToPostId = null } = {}) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    if (!text?.trim()) throw new Error('Post text is empty')
    if (text.length > MAX_POST_CHARS) throw new Error(`Post exceeds ${MAX_POST_CHARS} chars`)
    if (sending.value) return
    sending.value = true
    error.value = null
    signingActive.value = false
    signingStep.value = 0
    signingTotal.value = 0
    signingLabel.value = ''

    try {
      const raw = new TextEncoder().encode(text)
      const isReply = !!(replyToAuthor && replyToPostId)
      const limit = isReply ? INLINE_MAX_WITH_REPLY : INLINE_MAX_NO_REPLY

      if (raw.length <= limit) {
        await _submitInline(text, isReply, replyToAuthor, replyToPostId)
      } else {
        await _submitChunked(text, raw, isReply, replyToAuthor, replyToPostId)
      }
      await startDeltaSync()
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      sending.value = false
      signingActive.value = false
      signingStep.value = 0
      signingTotal.value = 0
      signingLabel.value = ''
    }
  }

  async function _submitInline(text, isReply, replyToAuthor, replyToPostId) {
    const postIdBytes = generatePostId()
    const replyOpts = isReply
      ? {
          replyAuthor: nqToAddressBytes(replyToAuthor),
          replyPostId: hexToPostIdBytes(replyToPostId),
        }
      : null
    const payload = buildPostInline(postIdBytes, text, replyOpts)

    const postIdHex = postIdToHex(postIdBytes)
    await putPost({
      author: auth.address,
      post_id: postIdHex,
      tx_hash: null,
      block_height: 0,
      tx_index: 0,
      content: text,
      total_chunks: null,
      chunks_received: 0,
      compressed: false,
      content_hash: null,
      is_inline: true,
      is_reply: isReply,
      reply_to_author: replyToAuthor,
      reply_to_post_id: replyToPostId,
      status: 'inline',
      first_seen_at: 0,
    })

    const signed = await hub.signTransaction({
      sender: auth.address,
      recipient: POST_CATALOG_ADDRESS,
      value: TX_VALUE_LUNA,
      fee: 0,
      extraData: payload,
    })
    const txHash = await rpc.sendRawTransaction(signed.serializedTx)
    if (txHash) {
      await updatePost(auth.address, postIdHex, { tx_hash: txHash })
    }
  }

  async function _submitChunked(text, raw, isReply, replyToAuthor, replyToPostId) {
    const comp = await deflateRaw(raw)
    const payload = shouldCompress(raw, comp) ? comp : raw
    const compressed = payload === comp

    const digest = await crypto.subtle.digest('SHA-256', payload)
    const contentHash = new Uint8Array(digest).slice(0, 8)
    const chunks = splitInto50ByteChunks(payload)

    const postIdBytes = generatePostId()
    const postIdHex = postIdToHex(postIdBytes)
    const authorBytes = nqToAddressBytes(auth.address)
    const derivedBytes = await derivePostAddress(authorBytes, postIdBytes)
    const derivedNq = addressBytesToNq(derivedBytes)

    const replyOpts = isReply
      ? {
          replyAuthor: nqToAddressBytes(replyToAuthor),
          replyPostId: hexToPostIdBytes(replyToPostId),
        }
      : null

    const hashHex = Array.from(contentHash)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    signingActive.value = true
    signingTotal.value = 1 + chunks.length
    signingStep.value = 1
    signingLabel.value = 'POST_START'

    const startPayload = buildPostStart(postIdBytes, chunks.length, compressed, contentHash, replyOpts)
    const startSigned = await hub.signTransaction({
      sender: auth.address,
      recipient: POST_CATALOG_ADDRESS,
      value: TX_VALUE_LUNA,
      fee: 0,
      extraData: startPayload,
    })

    await putPost({
      author: auth.address,
      post_id: postIdHex,
      tx_hash: null,
      block_height: 0,
      tx_index: 0,
      content: text,
      total_chunks: chunks.length,
      chunks_received: 0,
      compressed,
      content_hash: hashHex,
      is_inline: false,
      is_reply: isReply,
      reply_to_author: replyToAuthor,
      reply_to_post_id: replyToPostId,
      status: 'pending',
      first_seen_at: 0,
    })

    const startTxHash = await rpc.sendRawTransaction(startSigned.serializedTx)
    if (startTxHash) {
      await updatePost(auth.address, postIdHex, { tx_hash: startTxHash })
    }

    for (let i = 0; i < chunks.length; i++) {
      signingStep.value = i + 2
      signingLabel.value = `POST_CHUNK ${i + 1}/${chunks.length}`
      const chunkPayload = buildPostChunk(postIdBytes, i, chunks[i])
      const signed = await hub.signTransaction({
        sender: auth.address,
        recipient: derivedNq,
        value: TX_VALUE_LUNA,
        fee: 0,
        extraData: chunkPayload,
      })
      await rpc.sendRawTransaction(signed.serializedTx)
    }
  }

  return {
    sending,
    error,
    signingActive,
    signingStep,
    signingTotal,
    signingLabel,
    submitPost,
    claimProfile,
    txCount,
  }
}
