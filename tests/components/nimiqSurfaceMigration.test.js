import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const loadSource = (filePath) => readFileSync(`${process.cwd()}/${filePath}`, 'utf8')

describe('Nimiq content surface migration', () => {
  it('uses shared feed controls, notices, cards, and technical typography', () => {
    const feed = loadSource('src/components/feed/FeedView.vue')
    const post = loadSource('src/components/feed/PostCard.vue')

    expect(feed).toContain('nf-segmented-control')
    expect(feed).toContain(':aria-pressed="ui.activeTab === \'global\'"')
    expect(feed).toContain(':aria-pressed="ui.activeTab === \'following\'"')
    expect(feed).toMatch(/>\s*Global\s*<\/button>/)
    expect(feed).toMatch(/>\s*Following\s*<\/button>/)
    expect(feed).toContain('nq-panel')
    expect(feed).not.toMatch(/<button[^>]*:role=/)
    expect(feed).toMatch(/<span[^>]*role="status"[^>]*aria-live="polite"/)
    expect(feed).toContain('role="alert"')
    expect(feed).toMatch(/nf-mono[^\n]*RPC:/)
    expect(feed).toMatch(/nf-mono[^\n]*Catalog:/)
    expect(post).toContain('nq-card')
  })

  it('uses opacity-ladder variables for loading placeholders', () => {
    const skeleton = loadSource('src/components/feed/PostSkeleton.vue')
    const profile = loadSource('src/components/profile/ProfileView.vue')

    expect(skeleton).not.toContain('slate')
    expect(skeleton).toContain('var(--text-12)')
    expect(profile).not.toContain('slate')
    expect(profile).toContain('var(--text-12)')
  })

  it('uses labeled shared fields and announces errors', () => {
    const composer = loadSource('src/components/post/PostComposer.vue')
    const search = loadSource('src/components/search/UserSearch.vue')
    const card = loadSource('src/components/profile/ProfileCard.vue')
    const profile = loadSource('src/components/profile/ProfileView.vue')

    expect(composer).toContain('aria-label="Post text"')
    expect(composer).toContain('nq-input')
    expect(composer).toMatch(/v-if="error[^>]*role="alert"/)
    expect(search).toContain('aria-label="Search usernames"')
    expect(search).toContain('nq-input')
    expect(card).toContain('for="profile-username"')
    expect(card).toContain('id="profile-username"')
    expect(card).toContain('for="profile-display-name"')
    expect(card).toContain('id="profile-display-name"')
    expect(card).toMatch(/v-if="editError"[^>]*role="alert"/)
    expect(profile).toContain('for="rpc-endpoint"')
    expect(profile).toContain('id="rpc-endpoint"')
    expect(profile).toMatch(/v-if="rpcError"[^>]*role="alert"/)
    expect(profile).toMatch(/nf-mono[^\n]*default:/)
    expect(profile).toMatch(/v-if="debugData"[^>]*nf-mono/)
  })
})
