import { describe, expect, it } from 'vitest'
import { shellClasses } from '../../src/chain/miniAppLayout.js'

describe('mini app layout', () => {
  it('uses the full viewport inside Nimiq Pay', () => {
    expect(shellClasses(true)).toEqual({
      outer: 'h-dvh w-full',
      page: 'relative nf-page h-full w-full overflow-hidden',
      nav: 'absolute bottom-0 inset-x-0 z-40',
      navInner: 'border-t border-[var(--nf-border)] bg-white px-2 py-2',
    })
  })

  it('keeps the centered browser shell outside Nimiq Pay', () => {
    expect(shellClasses(false)).toEqual({
      outer: 'min-h-screen px-3 py-3 sm:flex sm:justify-center sm:px-6 sm:py-6',
      page:
        'relative nf-page w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--nf-border)] h-[calc(100vh-1.5rem)] sm:h-[calc(100vh-3rem)]',
      nav: 'absolute bottom-3 inset-x-0 z-40 px-3 sm:px-4',
      navInner: 'nf-card px-2 py-2',
    })
  })
})
