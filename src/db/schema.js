import Dexie from 'dexie'

export const db = new Dexie('nimfeed-v1')

db.version(1).stores({
  users: 'address, username',
  username_claims: '[username+address], username, address',
  posts: '[author+post_id], block_height, author, status, [reply_to_author+reply_to_post_id]',
  post_chunks: '[author+post_id+chunk_index]',
  follows: '[follower+followee], follower, followee',
  likes: '[liker+post_author+post_id], [post_author+post_id], liker',
  catalog_refs: 'tx_hash, type, sender, [type+block_height+tx_index], [sender+type]',
  sync_state: 'address',
})

db.version(2).stores({
  profile_claims: '[username+address], username, address',
  users: 'address, username',
  posts: '[author+post_id], block_height, author, status, [reply_to_author+reply_to_post_id]',
  post_chunks: '[author+post_id+chunk_index]',
  catalog_refs: 'tx_hash, type, sender, [type+block_height+tx_index], [sender+type]',
  follows: '[follower+followee], follower, followee',
  sync_state: 'scope_key',
}).upgrade(async (tx) => {
  try {
    await tx.table('sync_state').clear()
  } catch {
    /* fresh install */
  }
  try {
    await tx.table('username_claims').clear()
  } catch {
    /* dropped store */
  }
  try {
    await tx.table('likes').clear()
  } catch {
    /* dropped store */
  }
})
