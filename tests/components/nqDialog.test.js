import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import NqDialog from '../../src/components/common/NqDialog.vue'

const source = readFileSync(`${process.cwd()}/src/components/common/NqDialog.vue`, 'utf8')

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

describe('NqDialog accessibility', () => {
  it('provides dialog semantics, dismissal controls, and a focus lifecycle', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain(':aria-labelledby="titleId"')
    expect(source).toContain(':aria-describedby="description ? descriptionId : undefined"')
    expect(source).toContain(':id="titleId"')
    expect(source).toContain(':id="descriptionId"')
    expect(source).toContain('@keydown.esc="emitClose"')
    expect(source).toContain('@click.self="closeFromBackdrop"')
    expect(source).toContain('aria-label="Close"')
    expect(source).toContain('previouslyFocusedElement')
    expect(source).toContain('previouslyFocusedElement.value?.focus()')
    expect(source).toContain('@keydown.tab="trapFocus"')
    expect(source).toContain('event.shiftKey')
  })

  it('uses the shared card surface and exposes content and action slots', () => {
    expect(source).toContain('<Teleport to="body">')
    expect(source).toContain('<Transition name="nq-dialog">')
    expect(source).toContain('nq-card')
    expect(source).toContain('max-width: 360px')
    expect(source).toContain('background: var(--nf-soft)')
    expect(source).not.toContain('var(--nf-surface-soft)')
    expect(source).toContain('<slot />')
    expect(source).toContain('<slot name="actions" />')
  })

  it('renders its close control with touch-sized dimensions', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      render: () => h(NqDialog, { open: true, title: 'Touch targets' }, {
        actions: () => h('button', { id: 'dialog-action' }, 'Cancel'),
      }),
    })

    try {
      app.mount(host)
      await nextTick()
      const close = document.querySelector('[aria-label="Close"]')

      expect(Number.parseFloat(matchedStyle(close, 'width'))).toBeGreaterThanOrEqual(44)
      expect(Number.parseFloat(matchedStyle(close, 'height'))).toBeGreaterThanOrEqual(44)
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('does not overwrite initial control focus with panel focus', () => {
    expect(source).toContain('const initialFocusTarget = focusableElements()[0]')
    expect(source).toContain('if (initialFocusTarget) initialFocusTarget.focus()')
    expect(source).toContain('else panel.value?.focus()')
    expect(source).not.toContain('focusableElements()[0]?.focus() ?? panel.value?.focus()')
  })

  it('mounts with initial focus, traps focus, closes, and restores its trigger', async () => {
    const open = ref(false)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup() {
        return () => h('div', [
          h('button', { id: 'trigger', onClick: () => { open.value = true } }, 'Open'),
          h(NqDialog, { open: open.value, title: 'Test', onClose: () => { open.value = false } }, {
            default: () => h('button', { id: 'action' }, 'Action'),
          }),
        ])
      },
    })

    try {
      app.mount(host)
      const trigger = document.querySelector('#trigger')
      trigger.focus()
      trigger.click()
      await nextTick()
      await nextTick()

      const close = document.querySelector('[aria-label="Close"]')
      const action = document.querySelector('#action')
      expect(document.activeElement).toBe(close)

      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
      expect(document.activeElement).toBe(action)
      action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      expect(document.activeElement).toBe(close)

      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('preserves the external trigger when one dialog replaces another', async () => {
    const step = ref(0)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup() {
        return () => h('div', [
          h('button', { id: 'handoff-trigger', onClick: () => { step.value = 1 } }, 'Open'),
          h(NqDialog, { open: step.value === 1, title: 'First', onClose: () => { step.value = 0 } }, {
            default: () => h('button', { id: 'next', onClick: () => { step.value = 2 } }, 'Next'),
          }),
          step.value === 2 ? h(NqDialog, { open: true, title: 'Second', onClose: () => { step.value = 0 } }) : null,
        ])
      },
    })

    try {
      app.mount(host)
      const trigger = document.querySelector('#handoff-trigger')
      trigger.focus()
      trigger.click()
      await nextTick(); await nextTick()
      document.querySelector('#next').click()
      await nextTick(); await nextTick()
      await new Promise((resolve) => setTimeout(resolve, 250))
      document.querySelector('[role="dialog"] [aria-label="Close"]').click()
      await nextTick()
      expect(document.activeElement).toBe(trigger)
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
