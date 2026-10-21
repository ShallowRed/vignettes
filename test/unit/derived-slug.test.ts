import { describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import { useDerivedSlug } from '../../layers/studio/src/composables/useDerivedSlug'

const derive = (title: string) => title.toLowerCase().replace(/\s+/g, '-')

describe('useDerivedSlug', () => {
  it('derives the slug of a modal mounted already open', () => {
    const state = reactive({ title: 'Talk Two', slug: '' })
    useDerivedSlug(state, () => state.title, derive)
    expect(state.slug).toBe('talk-two')
  })

  it('keeps a typed slug when the title changes', async () => {
    const state = reactive({ title: 'Talk', slug: '' })
    const { slug } = useDerivedSlug(state, () => state.title, derive)
    slug.value = 'mine'
    state.title = 'Another talk'
    await nextTick()
    expect(state.slug).toBe('mine')
  })

  it('follows the title again once the field is emptied', async () => {
    const state = reactive({ title: 'Talk', slug: '' })
    const { slug } = useDerivedSlug(state, () => state.title, derive)
    slug.value = 'mine'
    slug.value = ''
    state.title = 'Another talk'
    await nextTick()
    expect(state.slug).toBe('another-talk')
  })
})
