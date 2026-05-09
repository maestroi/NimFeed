import { describe, expect, it } from 'vitest'
import { segmentsForLinkifiedText } from '../../src/utils/linkifyText.js'

describe('segmentsForLinkifiedText', () => {
  it('returns single text segment when there are no URLs', () => {
    expect(segmentsForLinkifiedText('hello world')).toEqual([{ type: 'text', value: 'hello world' }])
  })

  it('splits http URL from surrounding text', () => {
    expect(segmentsForLinkifiedText('see https://nimiq.com/ ok')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://nimiq.com/', label: 'https://nimiq.com/' },
      { type: 'text', value: ' ok' },
    ])
  })

  it('handles domain-only URLs linkify normalizes', () => {
    const segs = segmentsForLinkifiedText('visit example.com today')
    expect(segs).toHaveLength(3)
    expect(segs[1].type).toBe('link')
    expect(segs[1].href).toMatch(/^http/)
    expect(segs[1].label).toContain('example.com')
  })

  it('preserves newlines in text parts', () => {
    expect(segmentsForLinkifiedText('a\nb')).toEqual([{ type: 'text', value: 'a\nb' }])
  })

  it('handles null/empty', () => {
    expect(segmentsForLinkifiedText('')).toEqual([{ type: 'text', value: '' }])
    expect(segmentsForLinkifiedText(null)).toEqual([{ type: 'text', value: '' }])
  })
})
