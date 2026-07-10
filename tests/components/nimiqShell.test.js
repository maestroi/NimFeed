import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(`${process.cwd()}/${path}`, 'utf8')
}

describe('Nimiq-aligned application shell', () => {
  it('keeps the shell surface quiet and free of decorative radial backgrounds', () => {
    const shell = source('src/components/layout/AppShell.vue')
    const layout = source('src/chain/miniAppLayout.js')

    expect(shell).toContain('bg-[var(--nf-surface)]')
    expect(`${shell}\n${layout}`).not.toContain('radial-gradient')
  })

  it('keeps all navigation destinations and capability-gates only create', () => {
    const nav = source('src/components/layout/BottomNav.vue')

    expect(nav).toContain('>Home</span>')
    expect(nav).toContain('>Search</span>')
    expect(nav).toContain('>Profile</span>')
    expect(nav).toMatch(/v-if="walletRuntime\.canPublishPosts\.value"[\s\S]{0,250}aria-label="Create post"/)
    expect(nav).not.toMatch(/v-if="walletRuntime\.canPublishPosts\.value"[\s\S]{0,900}Home/)
  })

  it('uses evenly distributed nav destinations with touch-safe targets', () => {
    const nav = source('src/components/layout/BottomNav.vue')
    const layout = source('src/chain/miniAppLayout.js')

    expect(layout.match(/grid-cols-4/g)).toHaveLength(2)
    expect(nav).toContain('flex flex-col items-center gap-1')
    expect(nav).not.toContain('nf-icon-button')
    expect(nav).not.toContain('col-start-')
    expect(layout).toContain('nf-card')
  })

  it('uses shared wallet controls and an accessible chevron icon', () => {
    const wallet = source('src/components/auth/WalletButton.vue')

    expect(wallet).toContain('nq-button light-blue')
    expect(wallet).toContain('nf-wallet-trigger nf-focus')
    expect(wallet).toContain('nq-button-s nf-focus')
    expect(wallet).toContain('nf-button-quiet nf-focus')
    expect(wallet).toContain('aria-label="Open wallet menu"')
    expect(wallet).toContain('<svg')
    expect(wallet).not.toContain('▾')
  })

  it('keeps the logged-in wallet trigger auto-width and touch-safe', () => {
    const wallet = source('src/components/auth/WalletButton.vue')
    const trigger = wallet.match(/<button\s+type="button"\s+aria-label="Open wallet menu"[\s\S]*?<\/button>/)?.[0]

    expect(trigger).toBeTruthy()
    expect(trigger).not.toContain('nf-icon-button')
    expect(trigger).toContain('nf-wallet-trigger')
    expect(wallet).toMatch(/\.nf-wallet-trigger\s*{[^}]*min-height:\s*44px;[^}]*width:\s*auto;/)
  })
})
