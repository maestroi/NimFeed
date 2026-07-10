import { createPinia } from 'pinia'
import { createApp, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/indexer/useIndexer.js', () => ({
  useIndexer: () => ({ startDeltaSync: vi.fn(), enqueueLocalTransaction: vi.fn() }),
}))
import LoginModal from '../../src/components/auth/LoginModal.vue'
import OnboardingFlow from '../../src/components/auth/OnboardingFlow.vue'
import TipModal from '../../src/components/post/TipModal.vue'
import { useUiStore } from '../../src/stores/ui.js'

const mountedApps = []

function matchedStyle(element, property) {
  if (element.style.getPropertyValue(property)) return element.style.getPropertyValue(property)
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule.selectorText && element.matches(rule.selectorText) && rule.style.getPropertyValue(property)) {
        return rule.style.getPropertyValue(property)
      }
    }
  }
  return ''
}

async function mount(component, configure = () => {}) {
  const pinia = createPinia()
  const host = document.createElement('div')
  document.body.append(host)
  configure(pinia)
  const app = createApp({ render: () => h(component) }).use(pinia)
  app.mount(host)
  mountedApps.push([app, host])
  await nextTick()
  await nextTick()
}

afterEach(() => {
  for (const [app, host] of mountedApps.splice(0)) {
    app.unmount()
    host.remove()
  }
})

describe('dialog touch targets', () => {
  it.each([
    ['LoginModal', LoginModal, (pinia) => { useUiStore(pinia).loginModalOpen = true }],
    ['OnboardingFlow', OnboardingFlow, () => {}],
    ['TipModal', TipModal, (pinia) => {
      useUiStore(pinia).tipTarget = { address: 'NQ00 TEST', label: 'Test user' }
    }],
  ])('%s renders its Cancel action at least 44px high', async (_name, component, configure) => {
    await mount(component, configure)
    const cancel = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Cancel')

    expect(cancel).toBeTruthy()
    expect(Number.parseFloat(matchedStyle(cancel, 'min-height'))).toBeGreaterThanOrEqual(44)
  })

  it('renders stable touch-sized tip presets', async () => {
    await mount(TipModal, (pinia) => {
      useUiStore(pinia).tipTarget = { address: 'NQ00 TEST', label: 'Test user' }
    })
    const presets = [...document.querySelectorAll('[aria-label="Tip amount"] button')]

    expect(presets).toHaveLength(4)
    for (const preset of presets) {
      expect(Number.parseFloat(matchedStyle(preset, 'min-height'))).toBeGreaterThanOrEqual(44)
      expect(matchedStyle(preset, 'width')).toBe('100%')
    }
  })
})
