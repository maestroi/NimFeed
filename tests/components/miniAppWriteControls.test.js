import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(`${process.cwd()}/${path}`, 'utf8')
}

describe('Nimiq Pay write controls', () => {
  it('hides the post button without hiding Home or Search', () => {
    const nav = source('src/components/layout/BottomNav.vue')

    expect(nav).toMatch(
      /v-if="walletRuntime\.canWriteBinaryTransactions\.value"\s+type="button"\s+class="nf-focus nf-press mx-auto h-12 w-12/,
    )
    expect(nav).not.toMatch(
      /v-if="walletRuntime\.canWriteBinaryTransactions\.value"[\s\S]{0,300}<span class="text-\[11px\] font-semibold">(?:Home|Search)<\/span>/,
    )
  })

  it('removes the feed header wallet button', () => {
    const feed = source('src/components/feed/FeedView.vue')

    expect(feed).not.toContain('WalletButton')
  })
})
