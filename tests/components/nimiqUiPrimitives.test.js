import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8')
const tokens = readFileSync(`${process.cwd()}/src/tokens/nimiq-tokens.css`, 'utf8')

describe('Nimiq UI primitives', () => {
  it('imports canonical kit tokens and typography', () => {
    expect(css).toContain('@import "./tokens/nimiq-tokens.css"')
    expect(tokens).toContain('--nimiq-light-blue:')
    expect(css).toMatch(/\.nq-h1[^}]*font-size:\s*24px/)
    expect(css).toMatch(/\.nq-h2[^}]*font-size:\s*20px/)
    expect(css).toMatch(/\.nq-h3[^}]*font-size:\s*16px/)
    expect(css).toMatch(/\.nq-button[^}]*min-height:\s*48px/)
    expect(css).toMatch(/\.nq-input[^}]*border-radius:\s*var\(--nimiq-radius-input\)/)
    expect(css).toMatch(/\.nq-card\s*{[^}]*box-shadow:\s*var\(--nimiq-shadow-card\)/)
  })

  it('keeps kit-accurate gradient utilities separate', () => {
    expect(css).toMatch(/\.nq-blue-bg[^}]*var\(--nimiq-blue-bg\)/)
    expect(css).toMatch(/\.nq-light-blue-bg[^}]*var\(--nimiq-light-blue-bg\)/)
  })

  it('keeps visible focus and reduced motion support', () => {
    expect(css).toContain('.nf-focus:focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
