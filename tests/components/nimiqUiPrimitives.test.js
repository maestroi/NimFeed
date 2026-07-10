import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8')

describe('Nimiq UI primitives', () => {
  it('uses canonical typography, radii, and controls', () => {
    expect(css).toContain('--nimiq-radius-card: 10px')
    expect(css).toContain('--nimiq-radius-input: 4px')
    expect(css).toMatch(/\.nq-h1[\s\S]*font-size:\s*24px/)
    expect(css).toMatch(/\.nq-h2[\s\S]*font-size:\s*20px/)
    expect(css).toMatch(/\.nq-h3[\s\S]*font-size:\s*16px/)
    expect(css).toMatch(/\.nq-button[\s\S]*min-height:\s*48px/)
    expect(css).toMatch(/\.nf-input[\s\S]*border-radius:\s*var\(--nimiq-radius-input\)/)
  })

  it('keeps visible focus and reduced motion support', () => {
    expect(css).toContain('.nf-focus:focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
