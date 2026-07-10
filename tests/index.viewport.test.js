import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mobile viewport', () => {
  it('disables pinch zoom in the mini app WebView', () => {
    const html = readFileSync(`${process.cwd()}/index.html`, 'utf8')

    expect(html).toContain(
      'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"',
    )
  })

  it('keeps mini-app navigation clear of the device safe area', () => {
    const layout = readFileSync(`${process.cwd()}/src/chain/miniAppLayout.js`, 'utf8')

    expect(layout).toContain('pb-[max(0.5rem,env(safe-area-inset-bottom))]')
    expect(layout.match(/navGrid: 'grid grid-cols-4/g)).toHaveLength(2)
  })
})
