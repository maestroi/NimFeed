import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(`${process.cwd()}/src/components/feed/FeedView.vue`, 'utf8')

describe('public feed sync status', () => {
  it('shows tappable sync state and public diagnostics without requiring a profile', () => {
    expect(source).toContain("indexer.addEventListener('sync:status', onSyncStatus)")
    expect(source).toContain('Syncing history…')
    expect(source).toContain('Up to date')
    expect(source).toContain('Sync failed · Retry')
    expect(source).toContain('syncDetailsOpen')
    expect(source).toContain('syncStatus.rpcEndpoint')
    expect(source).toContain('syncStatus.postCount')
    expect(source).toContain('syncStatus.refCount')
  })
})
