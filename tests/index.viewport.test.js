import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mobile viewport', () => {
  it('disables pinch zoom in the mini app WebView', () => {
    const html = readFileSync(`${process.cwd()}/index.html`, 'utf8')

    expect(html).toContain(
      'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"',
    )
  })
})
