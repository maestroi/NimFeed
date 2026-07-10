import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const overlayOwners = [
  'src/components/auth/LoginModal.vue',
  'src/components/auth/OnboardingFlow.vue',
  'src/components/post/TipModal.vue',
  'src/components/layout/AppShell.vue',
  'src/components/post/PostThreadView.vue',
]

function source(path) {
  return readFileSync(`${process.cwd()}/${path}`, 'utf8')
}

describe('dialog surface migration', () => {
  it.each(overlayOwners)('%s uses NqDialog instead of a hand-built overlay', (path) => {
    const component = source(path)

    expect(component).toMatch(/import NqDialog from ['"].*common\/NqDialog\.vue['"]|import NqDialog from ['"]\.\.\/common\/NqDialog\.vue['"]|<NqDialog/)
    expect(component).toContain('<NqDialog')
    expect(component).not.toContain('fixed inset-0 z-50')
  })

  it('keeps runtime-specific login labels and announces login state', () => {
    const login = source('src/components/auth/LoginModal.vue')

    expect(login).toContain('Connect Nimiq Pay')
    expect(login).toContain('Connect with Nimiq Hub')
    expect(login).toContain('role="alert"')
    expect(login).toContain('aria-live="polite"')
  })

  it('labels onboarding fields and announces onboarding state', () => {
    const onboarding = source('src/components/auth/OnboardingFlow.vue')

    expect(onboarding).toContain('autocomplete="username"')
    expect(onboarding).toContain('autocomplete="name"')
    expect(onboarding).toContain('role="alert"')
    expect(onboarding).toContain('aria-live="polite"')
  })

  it('preserves tip input constraints and exposes presets as pressed options', () => {
    const tip = source('src/components/post/TipModal.vue')

    expect(tip).toMatch(/aria-label="Tip amount"/)
    expect(tip).toContain(':aria-pressed=')
    expect(tip).toMatch(/type="number"\s+min="0"\s+step="any"/)
    expect(tip).toContain('role="alert"')
    expect(tip).toContain('aria-live="polite"')
  })

  it.each([
    'src/components/layout/AppShell.vue',
    'src/components/post/PostThreadView.vue',
  ])('%s keeps composer dialogs wide', (path) => {
    expect(source(path)).toContain('panel-class="nf-dialog-wide"')
  })
})
