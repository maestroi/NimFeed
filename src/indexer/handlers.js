import { POST_CATALOG_ADDRESS, FOLLOW_CATALOG_ADDRESS } from '../protocol/constants.js'
import { parseTransaction } from '../protocol/decoder.js'
import { normalizeUsername } from '../protocol/utils.js'
import {
  putProfileClaim,
  getWinningClaim,
  getLatestClaimByAddress,
  putUser,
  getPost,
  putPost,
  updatePost,
  putChunk,
  putCatalogRef,
  getFollow,
  putFollow,
} from '../db/queries.js'
import { tryAssemble } from './assembler.js'

function normalizeNq(addr) {
  return String(addr || '').replace(/\s+/g, '').toUpperCase()
}

function catalogEq(txTo, catalogAddr) {
  return normalizeNq(txTo) === normalizeNq(catalogAddr)
}

export async function processPostCatalogTx(tx) {
  if (!catalogEq(tx.to, POST_CATALOG_ADDRESS)) return
  const ev = parseTransaction(tx)
  if (!ev) return

  switch (ev.event) {
    case 'PROFILE_CLAIM':
      await handleProfileClaim(ev)
      break
    case 'POST_INLINE':
      await handlePostInline(ev)
      break
    case 'POST_START':
      await handlePostStart(ev)
      break
    default:
  }
}

export async function processFollowCatalogTx(tx) {
  if (!catalogEq(tx.to, FOLLOW_CATALOG_ADDRESS)) return
  const ev = parseTransaction(tx)
  if (!ev) return
  if (ev.event === 'FOLLOW' || ev.event === 'UNFOLLOW') await handleFollow(ev)
}

export async function processDerivedAddressTx(tx, expectedNq) {
  if (!catalogEq(tx.to, expectedNq)) return
  const ev = parseTransaction(tx)
  if (!ev || ev.event !== 'POST_CHUNK') return
  await handlePostChunk(ev)
}

async function handleProfileClaim(ev) {
  const username = normalizeUsername(ev.username)
  if (!username) return

  await putProfileClaim({
    username,
    address: ev.from,
    display_name: ev.displayName,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    tx_hash: ev.txHash,
  })

  await putCatalogRef({
    tx_hash: ev.txHash,
    type: 'PROFILE_CLAIM',
    sender: ev.from,
    post_id: null,
    username,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    seen_at: Date.now(),
  })

  const winning = await getWinningClaim(username)
  if (winning?.address === ev.from) {
    const latest = await getLatestClaimByAddress(ev.from, username)
    await putUser({
      address: ev.from,
      display_name: latest?.display_name ?? null,
      username,
      username_height: winning.block_height,
      username_tx_index: winning.tx_index,
      last_synced_height: ev.blockHeight,
    })
  }
}

async function handlePostInline(ev) {
  await putPost({
    author: ev.from,
    post_id: ev.postId,
    tx_hash: ev.txHash,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    content: ev.text,
    total_chunks: null,
    chunks_received: 0,
    compressed: false,
    content_hash: null,
    is_inline: true,
    is_reply: ev.isReply,
    reply_to_author: ev.replyToAuthor,
    reply_to_post_id: ev.replyToPostId,
    status: 'inline',
    first_seen_at: ev.blockHeight,
  })

  await putCatalogRef({
    tx_hash: ev.txHash,
    type: 'POST_INLINE',
    sender: ev.from,
    post_id: ev.postId,
    username: null,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    seen_at: Date.now(),
  })
}

async function handlePostStart(ev) {
  const existing = await getPost(ev.from, ev.postId)

  const record = {
    author: ev.from,
    post_id: ev.postId,
    tx_hash: ev.txHash,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    content: null,
    total_chunks: ev.totalChunks,
    chunks_received: existing?.chunks_received ?? 0,
    compressed: ev.compressed,
    content_hash: ev.contentHash,
    is_inline: false,
    is_reply: ev.isReply,
    reply_to_author: ev.replyToAuthor,
    reply_to_post_id: ev.replyToPostId,
    status: 'pending',
    first_seen_at: existing?.first_seen_at ?? ev.blockHeight,
  }

  await putPost(record)

  await putCatalogRef({
    tx_hash: ev.txHash,
    type: 'POST_START',
    sender: ev.from,
    post_id: ev.postId,
    username: null,
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
    seen_at: Date.now(),
  })

  await tryAssemble(ev.from, ev.postId)
}

async function handlePostChunk(ev) {
  const existing = await getPost(ev.from, ev.postId)

  await putChunk({
    author: ev.from,
    post_id: ev.postId,
    chunk_index: ev.chunkIndex,
    data: ev.data,
    data_len: ev.dataLen,
  })

  if (existing) {
    await updatePost(ev.from, ev.postId, {
      chunks_received: (existing.chunks_received ?? 0) + 1,
    })
  } else {
    await putPost({
      author: ev.from,
      post_id: ev.postId,
      block_height: 0,
      tx_index: 0,
      content: null,
      total_chunks: null,
      chunks_received: 1,
      compressed: false,
      content_hash: null,
      is_inline: false,
      is_reply: false,
      reply_to_author: null,
      reply_to_post_id: null,
      status: 'pending',
      first_seen_at: 0,
    })
  }

  await tryAssemble(ev.from, ev.postId)
}

async function handleFollow(ev) {
  const existing = await getFollow(ev.from, ev.targetAddress)

  const isNewer =
    !existing ||
    ev.blockHeight > existing.block_height ||
    (ev.blockHeight === existing.block_height && ev.txIndex > existing.tx_index)

  if (!isNewer) return

  await putFollow({
    follower: ev.from,
    followee: ev.targetAddress,
    active: ev.event === 'FOLLOW',
    block_height: ev.blockHeight,
    tx_index: ev.txIndex,
  })
}

/** Back-compat shim for tests and tooling */
export async function processTransaction(tx) {
  await processPostCatalogTx(tx)
  await processFollowCatalogTx(tx)
}
