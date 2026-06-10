import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth.js'
import { useHub } from '../chain/hub.js'
import { getWalletRuntime } from '../chain/walletRuntime.js'
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
import { sha256Bytes } from '../protocol/hash.js'
import {
  POST_CATALOG_ADDRESS,
  TX_VALUE_LUNA,
  INLINE_MAX_NO_REPLY,
  INLINE_MAX_WITH_REPLY,
  MAX_POST_CHARS,
} from '../protocol/constants.js'
import { getWinningClaim, putPost, updatePost } from '../db/queries.js'
import { useIndexer } from '../indexer/useIndexer.js'
import { MINI_APP_CHUNK_DATA_SIZE, MINI_APP_INLINE_DATA_SIZE } from '../protocol/miniAppEnvelope.js'

function sameAddress(a, b) {
  return String(a || '').replace(/\s+/g, '').toUpperCase() === String(b || '').replace(/\s+/g, '').toUpperCase()
}

export function usePost() {
  const auth = useAuthStore()
  const hub = useHub()
  const walletRuntime = getWalletRuntime()
  const { startDeltaSync } = useIndexer()
  const sending = ref(false)
  const error = ref(null)
  const signingActive = ref(false)
  const signingStep = ref(0)
  const signingTotal = ref(0)
  const signingLabel = ref('')
  const pendingChunkSession = ref(null)
  const hasPendingChunkUpload = computed(() => !!pendingChunkSession.value)
  const pendingChunkRemaining = computed(() => {
    const s = pendingChunkSession.value
    if (!s) return 0
    return s.chunks.length - s.nextChunkIndex
  })

  function isPopupBlockedError(err) {
    return String(err?.message || '').includes('Failed to open popup')
  }

  function sessionKey(text, replyToAuthor, replyToPostId) {
    return JSON.stringify({
      t: text,
      a: replyToAuthor || null,
      p: replyToPostId || null,
    })
  }

  async function sendPayload(recipient, payload) {
    if (walletRuntime.isNimiqPay.value) {
      const txHash = await walletRuntime.sendMiniAppTransaction({
        recipient,
        value: TX_VALUE_LUNA,
        fee: 0,
        extraData: payload,
      })
      let tx = null
      for (let attempt = 0; attempt < 5 && !tx?.from; attempt++) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 500))
        tx = await rpc.getTransactionByHash(txHash)
      }
      if (!tx?.from) throw new Error('Post sent, but the signing account could not be resolved yet. Refresh shortly.')
      if (!sameAddress(tx.from, auth.address)) {
        walletRuntime.rememberSigningAddress(walletRuntime.custodialAddress.value ?? auth.address, tx.from)
        auth.setAddress(tx.from)
        await auth.loadProfile()
      }
      return { txHash, sender: tx.from }
    }
    const signed = await hub.signTransaction({
      sender: auth.address,
      recipient,
      value: TX_VALUE_LUNA,
      fee: 0,
      extraData: payload,
    })
    const txHash = await rpc.sendRawTransaction(signed.serializedTx)
    return { txHash, sender: auth.address }
  }

  async function claimProfile(username, displayName) {
    if (!auth.isLoggedIn) throw new Error('Not logged in')
    const currentWinner = await getWinningClaim(username)
    if (currentWinner?.address && !sameAddress(currentWinner.address, auth.address)) {
      throw new Error(`@${username} is already taken.`)
    }

    const payload = buildProfileClaim(username, displayName)
    await sendPayload(POST_CATALOG_ADDRESS, payload)
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
    const limit = walletRuntime.isNimiqPay.value
      ? MINI_APP_INLINE_DATA_SIZE
      : isReply
        ? INLINE_MAX_WITH_REPLY
        : INLINE_MAX_NO_REPLY
    if (raw.length <= limit) return 1
    const chunkSize = walletRuntime.isNimiqPay.value ? MINI_APP_CHUNK_DATA_SIZE : 50
    const chunks = Math.ceil(raw.length / chunkSize) + 1
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
      const limit = walletRuntime.isNimiqPay.value
        ? isReply
          ? 0
          : MINI_APP_INLINE_DATA_SIZE
        : isReply
          ? INLINE_MAX_WITH_REPLY
          : INLINE_MAX_NO_REPLY
      const key = sessionKey(text, replyToAuthor, replyToPostId)

      if (pendingChunkSession.value && pendingChunkSession.value.key !== key) {
        const remaining = pendingChunkRemaining.value
        throw new Error(
          `You have an unfinished chunked post (${remaining} chunk${remaining === 1 ? '' : 's'} left). Click Post again on the same text to continue, or cancel the pending upload.`,
        )
      }

      if (raw.length <= limit) {
        await _submitInline(text, isReply, replyToAuthor, replyToPostId)
      } else {
        await _submitChunked(text, raw, isReply, replyToAuthor, replyToPostId, key)
      }
      await startDeltaSync()
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      sending.value = false
      if (!pendingChunkSession.value) {
        signingActive.value = false
        signingStep.value = 0
        signingTotal.value = 0
        signingLabel.value = ''
      }
    }
  }

  function cancelPendingChunkUpload() {
    pendingChunkSession.value = null
    signingActive.value = false
    signingStep.value = 0
    signingTotal.value = 0
    signingLabel.value = ''
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
    const sent = await sendPayload(POST_CATALOG_ADDRESS, payload)
    await putPost({
      author: sent.sender,
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

    if (sent.txHash) {
      await updatePost(sent.sender, postIdHex, { tx_hash: sent.txHash })
    }
  }

  async function _submitChunked(text, raw, isReply, replyToAuthor, replyToPostId, key) {
    let session = pendingChunkSession.value
    if (!session) {
      const comp = await deflateRaw(raw)
      const payload = shouldCompress(raw, comp) ? comp : raw
      const compressed = payload === comp

      const contentHash = sha256Bytes(payload).slice(0, 8)
      const chunks = walletRuntime.isNimiqPay.value
        ? Array.from({ length: Math.ceil(payload.length / MINI_APP_CHUNK_DATA_SIZE) }, (_, i) =>
            payload.slice(i * MINI_APP_CHUNK_DATA_SIZE, (i + 1) * MINI_APP_CHUNK_DATA_SIZE),
          )
        : splitInto50ByteChunks(payload)

      const postIdBytes = generatePostId()
      const postIdHex = postIdToHex(postIdBytes)
      const replyOpts = isReply
        ? walletRuntime.isNimiqPay.value
          ? { replyPostId: hexToPostIdBytes(replyToPostId) }
          : {
              replyAuthor: nqToAddressBytes(replyToAuthor),
              replyPostId: hexToPostIdBytes(replyToPostId),
            }
        : null

      const hashHex = Array.from(contentHash)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      session = {
        key,
        text,
        postIdBytes,
        postIdHex,
        author: null,
        derivedNq: null,
        chunks,
        compressed,
        contentHash,
        hashHex,
        replyOpts,
        replyToAuthor,
        replyToPostId,
        isReply,
        startSubmitted: false,
        nextChunkIndex: 0,
      }
      pendingChunkSession.value = session
    }

    signingActive.value = true
    signingTotal.value = 1 + session.chunks.length

    if (!session.startSubmitted) {
      signingStep.value = 1
      signingLabel.value = 'POST_START'
      const startPayload = buildPostStart(
        session.postIdBytes,
        session.chunks.length,
        session.compressed,
        session.contentHash,
        session.replyOpts,
      )

      let startSent
      try {
        startSent = await sendPayload(POST_CATALOG_ADDRESS, startPayload)
      } catch (err) {
        if (isPopupBlockedError(err)) {
          signingLabel.value = 'Popup blocked. Click Post to continue.'
          throw new Error('Popup blocked while signing start transaction. Click Post again to continue.')
        }
        throw err
      }

      session.author = startSent.sender
      const authorBytes = nqToAddressBytes(session.author)
      const derivedBytes = await derivePostAddress(authorBytes, session.postIdBytes)
      session.derivedNq = addressBytesToNq(derivedBytes)

      await putPost({
        author: session.author,
        post_id: session.postIdHex,
        tx_hash: null,
        block_height: 0,
        tx_index: 0,
        content: session.text,
        total_chunks: session.chunks.length,
        chunks_received: 0,
        compressed: session.compressed,
        content_hash: session.hashHex,
        is_inline: false,
        is_reply: session.isReply,
        reply_to_author: session.replyToAuthor,
        reply_to_post_id: session.replyToPostId,
        status: 'pending',
        first_seen_at: 0,
      })

      if (startSent.txHash) {
        await updatePost(session.author, session.postIdHex, { tx_hash: startSent.txHash })
      }
      session.startSubmitted = true
    }

    for (let i = session.nextChunkIndex; i < session.chunks.length; i++) {
      signingStep.value = i + 2
      signingLabel.value = `POST_CHUNK ${i + 1}/${session.chunks.length}`
      const chunkPayload = buildPostChunk(session.postIdBytes, i, session.chunks[i])
      try {
        await sendPayload(session.derivedNq, chunkPayload)
      } catch (err) {
        if (isPopupBlockedError(err)) {
          session.nextChunkIndex = i
          signingLabel.value = `Popup blocked on chunk ${i + 1}/${session.chunks.length}. Click Post to continue.`
          throw new Error(`Popup blocked on chunk ${i + 1}/${session.chunks.length}. Click Post again to continue.`)
        }
        throw err
      }
      session.nextChunkIndex = i + 1
    }

    pendingChunkSession.value = null
  }

  return {
    sending,
    error,
    signingActive,
    signingStep,
    signingTotal,
    signingLabel,
    hasPendingChunkUpload,
    pendingChunkRemaining,
    cancelPendingChunkUpload,
    submitPost,
    claimProfile,
    txCount,
  }
}
