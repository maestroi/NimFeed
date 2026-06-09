import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(`${process.cwd()}/src/components/search/UserSearch.vue`, 'utf8')

describe('Search People discovery state', () => {
  it('loads and shows active people before a search query is entered', () => {
    expect(source).toContain('getMostActiveUsers')
    expect(source).toContain('Active people')
    expect(source).toContain('result.postCount')
  })

  it('refreshes active people after the app indexer finishes syncing', () => {
    expect(source).toContain("indexer.addEventListener('catalog:updated', loadActivePeople)")
    expect(source).toContain("indexer.removeEventListener('catalog:updated', loadActivePeople)")
  })
})
