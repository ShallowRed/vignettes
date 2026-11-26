import mdcHtmlTags from '@nuxtjs/mdc/runtime/parser/utils/html-tags-list'
import { describe, expect, it } from 'vitest'
import { HTML_TAGS } from '../../packages/core/src/deck/html-tags.ts'

describe('html tags', () => {
  it('lists the HTML elements MDC renders as elements', () => {
    expect([...HTML_TAGS].sort()).toEqual([...mdcHtmlTags].sort())
  })
})
