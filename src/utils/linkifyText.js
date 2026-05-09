import LinkifyIt from 'linkify-it'

const linkify = new LinkifyIt()

/**
 * Split plain text into alternating text / URL segments for safe rendering (no HTML injection).
 */
export function segmentsForLinkifiedText(text) {
  if (text == null || text === '') {
    return [{ type: 'text', value: text ?? '' }]
  }
  const matches = linkify.match(text)
  if (!matches?.length) {
    return [{ type: 'text', value: text }]
  }
  const out = []
  let pos = 0
  for (const m of matches) {
    if (m.index > pos) {
      out.push({ type: 'text', value: text.slice(pos, m.index) })
    }
    out.push({ type: 'link', href: m.url, label: m.raw })
    pos = m.lastIndex
  }
  if (pos < text.length) {
    out.push({ type: 'text', value: text.slice(pos) })
  }
  return out
}
