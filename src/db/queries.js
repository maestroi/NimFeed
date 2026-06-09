import { db } from './schema.js'

// Profile claims
export const putProfileClaim = (claim) => db.profile_claims.put(claim)

export async function getWinningClaim(username) {
  const claims = await db.profile_claims.where('username').equals(username).toArray()
  if (!claims.length) return null
  return claims.sort((a, b) => a.block_height - b.block_height || a.tx_index - b.tx_index)[0]
}

export async function getLatestClaimByAddress(address, username) {
  const claims = await db.profile_claims.where('address').equals(address).toArray()
  const forUsername = claims.filter((c) => c.username === username)
  if (!forUsername.length) return null
  return forUsername.sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)[0]
}

export async function searchUsernames(query) {
  if (!query || query.length < 2) return []
  const normalized = query.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!normalized) return []
  const all = await db.profile_claims.where('username').startsWith(normalized).toArray()
  const winners = new Map()
  for (const claim of all) {
    const existing = winners.get(claim.username)
    if (
      !existing ||
      claim.block_height < existing.block_height ||
      (claim.block_height === existing.block_height && claim.tx_index < existing.tx_index)
    ) {
      winners.set(claim.username, claim)
    }
  }
  return [...winners.values()].slice(0, 20)
}

// Users
export const putUser = (user) => db.users.put(user)
export const getUser = (address) => db.users.get(address)
export const updateUser = (address, changes) => db.users.update(address, changes)
export const getUsersByUsername = (username) => db.users.where('username').equals(username).toArray()

function isEarlier(a, b) {
  return a.block_height < b.block_height || (a.block_height === b.block_height && a.tx_index < b.tx_index)
}

function isLater(a, b) {
  return a.block_height > b.block_height || (a.block_height === b.block_height && a.tx_index > b.tx_index)
}

export async function reconcileUsernameOwnership() {
  const claims = await db.profile_claims.toArray()
  if (!claims.length) return

  const winners = new Map()
  const latestByWinner = new Map()
  for (const claim of claims) {
    const winner = winners.get(claim.username)
    if (!winner || isEarlier(claim, winner)) {
      winners.set(claim.username, claim)
    }
    const ownerKey = `${claim.username}\u0000${claim.address}`
    const latest = latestByWinner.get(ownerKey)
    if (!latest || isLater(claim, latest)) {
      latestByWinner.set(ownerKey, claim)
    }
  }

  const users = await db.users.toArray()
  for (const user of users) {
    if (!user.username) continue
    const winner = winners.get(user.username)
    if (!winner || winner.address !== user.address) {
      await db.users.update(user.address, {
        username: null,
        username_height: null,
        username_tx_index: null,
      })
    }
  }

  for (const [username, winner] of winners) {
    const ownerKey = `${username}\u0000${winner.address}`
    const latest = latestByWinner.get(ownerKey)
    const existing = await db.users.get(winner.address)
    const patch = {
      display_name: latest?.display_name ?? existing?.display_name ?? null,
      username,
      username_height: winner.block_height,
      username_tx_index: winner.tx_index,
      last_synced_height: Math.max(existing?.last_synced_height ?? 0, winner.block_height ?? 0),
    }
    if (existing) {
      await db.users.update(winner.address, patch)
    } else {
      await db.users.put({ address: winner.address, ...patch })
    }
  }
}

// Posts
export const putPost = (post) => db.posts.put(post)
export const getPost = (author, postId) => db.posts.get([author, postId])
export const updatePost = (author, postId, changes) => db.posts.update([author, postId], changes)

export async function getPostsByAuthor(author) {
  return db.posts
    .where('author')
    .equals(author)
    .filter((p) => p.status === 'complete' || p.status === 'inline')
    .toArray()
}

export async function getMostActiveUsers(limit = 10) {
  const posts = await db.posts.toArray()
  const activityByAddress = new Map()

  for (const post of posts) {
    if (post.status !== 'complete' && post.status !== 'inline') continue
    const activity = activityByAddress.get(post.author) ?? { postCount: 0, latestHeight: 0 }
    activity.postCount += 1
    activity.latestHeight = Math.max(activity.latestHeight, post.block_height ?? 0)
    activityByAddress.set(post.author, activity)
  }

  const addresses = [...activityByAddress.keys()]
  const users = await db.users.bulkGet(addresses)

  return users
    .filter((user) => user?.username)
    .map((user) => ({ ...user, ...activityByAddress.get(user.address) }))
    .sort(
      (a, b) =>
        b.postCount - a.postCount ||
        b.latestHeight - a.latestHeight ||
        a.username.localeCompare(b.username),
    )
    .slice(0, limit)
}

export async function getReplies(replyToAuthor, replyToPostId) {
  return db.posts
    .where('[reply_to_author+reply_to_post_id]')
    .equals([replyToAuthor, replyToPostId])
    .filter((p) => p.status === 'complete' || p.status === 'inline')
    .toArray()
}

// Post chunks
export const putChunk = (chunk) => db.post_chunks.put(chunk)

export const getChunks = (author, post_id) =>
  db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, post_id, 0], [author, post_id, 255], true, true)
    .toArray()

export const deleteChunks = (author, post_id) =>
  db.post_chunks
    .where('[author+post_id+chunk_index]')
    .between([author, post_id, 0], [author, post_id, 255], true, true)
    .delete()

// Catalog refs
export const putCatalogRef = (ref) => db.catalog_refs.put(ref)

export async function getCatalogRefs(
  types,
  { limit = 20, beforeHeight = Infinity, beforeTxIndex = Infinity } = {},
) {
  const typeArray = Array.isArray(types) ? types : [types]
  const all = await db.catalog_refs.where('type').anyOf(typeArray).toArray()
  const filtered = all.filter(
    (r) =>
      r.block_height < beforeHeight ||
      (r.block_height === beforeHeight && r.tx_index < beforeTxIndex),
  )
  return filtered
    .sort((a, b) => b.block_height - a.block_height || b.tx_index - a.tx_index)
    .slice(0, limit)
}

export async function getCatalogRefsBySender(sender, types) {
  const typeArray = Array.isArray(types) ? types : [types]
  return db.catalog_refs
    .where('sender')
    .equals(sender)
    .filter((r) => typeArray.includes(r.type))
    .toArray()
}

export const getCatalogRef = (txHash) => db.catalog_refs.get(txHash)

// Sync state — primary key scope_key
export const getSyncState = (scopeKey) => db.sync_state.get(scopeKey)
export const putSyncState = (state) => db.sync_state.put(state)
export const updateSyncState = (scopeKey, changes) => db.sync_state.update(scopeKey, changes)

// Follows
export const putFollow = (follow) => db.follows.put(follow)
export const getFollow = (follower, followee) => db.follows.get([follower, followee])

export async function getFollowees(follower) {
  const rows = await db.follows.where('follower').equals(follower).toArray()
  return rows.filter((r) => r.active).map((r) => r.followee)
}

export async function getFollowers(followee) {
  const rows = await db.follows.where('followee').equals(followee).toArray()
  return rows.filter((r) => r.active).map((r) => r.follower)
}

export async function getFollowCounts(address) {
  const [following, followers] = await Promise.all([
    db.follows.where('follower').equals(address).filter((r) => r.active).count(),
    db.follows.where('followee').equals(address).filter((r) => r.active).count(),
  ])
  return { following, followers }
}

export async function isFollowing(follower, followee) {
  const row = await db.follows.get([follower, followee])
  return !!row?.active
}
