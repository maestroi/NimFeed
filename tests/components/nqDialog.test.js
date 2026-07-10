import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(`${process.cwd()}/src/components/common/NqDialog.vue`, 'utf8')

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
    expect(source).toContain('nf-card')
    expect(source).toContain('max-width: 360px')
    expect(source).toContain('<slot />')
    expect(source).toContain('<slot name="actions" />')
  })
})
