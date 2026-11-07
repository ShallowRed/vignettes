import type { PropType } from 'vue'
import type { SlideRenderFailure } from '../../packages/nuxt/src/runtime/config/injection-keys.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h, nextTick, onMounted, provide, ref, shallowRef } from 'vue'
import { useSlideErrorBoundary } from '../../packages/nuxt/src/runtime/composables/useSlideErrorBoundary.ts'
import { SLIDE_RENDER_FAILURES } from '../../packages/nuxt/src/runtime/config/injection-keys.ts'

// A renderer that keeps the tree in memory, so that the test patches the slides
// the way the browser does, without a DOM.
interface TestNode { tag: string, text: string, children: TestNode[], parent: TestNode | null }
const node = (tag: string, text = ''): TestNode => ({ tag, text, children: [], parent: null })
function remove(child: TestNode) {
  child.parent?.children.splice(child.parent.children.indexOf(child), 1)
  child.parent = null
}
const { createApp } = createRenderer<TestNode, TestNode>({
  insert(child, parent, anchor) {
    remove(child)
    const at = anchor ? parent.children.indexOf(anchor) : -1
    parent.children.splice(at < 0 ? parent.children.length : at, 0, child)
    child.parent = parent
  },
  remove,
  createElement: tag => node(tag),
  createText: text => node('#text', text),
  createComment: text => node('#comment', text),
  setText: (target, text) => { target.text = text },
  setElementText: (target, text) => {
    target.children.forEach(remove)
    if (text)
      target.children.push({ ...node('#text', text), parent: target })
  },
  parentNode: target => target.parent,
  nextSibling: (target) => {
    const siblings = target.parent?.children ?? []
    return siblings[siblings.indexOf(target) + 1] ?? null
  },
  patchProp: () => {},
})
const textOf = (target: TestNode): string => target.tag === '#text' ? target.text : target.children.map(textOf).join('')

// Deck components that throw without their name.
const Icon = defineComponent({
  props: { name: String },
  setup: props => () => h('span', `[${props.name!.toUpperCase()}]`),
})
// After its first render, the box hands its name to a child that throws, as
// a component of the deck does with a component of the interface.
const Label = defineComponent({
  props: { text: String },
  setup: props => () => props.text!.toUpperCase(),
})
const Box = defineComponent({
  props: { name: String },
  setup(props, { slots }) {
    let renders = 0
    return () => h('div', [renders++ ? h(Label, { text: props.name }) : props.name!.toUpperCase(), slots.default?.()])
  },
})
// Throws in its setup.
const Chart = defineComponent({
  setup() {
    throw new Error('no data')
  },
})
// Throws once mounted, and stays drawn.
const Clock = defineComponent({
  setup() {
    onMounted(() => {
      throw new Error('no time')
    })
    return () => h('time', 'now')
  },
})
// Throws until its source is ready.
const ready = ref(false)
const Feed = defineComponent({
  setup: () => () => {
    if (!ready.value)
      throw new Error('not ready')
    return 'feed'
  },
})
const components = { i: Icon, IconInline: Icon, Box, Chart, Clock, Feed }

interface TestSlide { key: string, icon?: string, box?: string, broken?: boolean, extra?: 'Chart' | 'Clock' | 'Feed' }

// Stands in for `SlideContent`, which draws the slide with MDC: the metadata
// of each parse is a new object, so the slide renders again.
const Content = defineComponent({
  name: 'Content',
  props: {
    slide: { type: Object as PropType<TestSlide>, required: true },
    metadata: { type: Object, required: true },
  },
  setup: props => () => {
    if (props.slide.broken)
      throw new Error('broken slide')
    return h('p', [
      `${props.slide.key} `,
      h(Icon, { name: 'ok' }),
      h(Icon, { name: props.slide.icon }),
      ...('box' in props.slide ? [h(Box, { name: props.slide.box }, () => 'content')] : []),
      ...(props.slide.extra ? [h(components[props.slide.extra])] : []),
    ])
  },
})

function mountDeck(initial: TestSlide[]) {
  const slides = shallowRef(initial)
  const reports = new Map<symbol, readonly SlideRenderFailure[]>()
  const root = node('root')
  // Stands in for `RevealSlides`, which keys the slides by their text.
  const Deck = defineComponent({
    setup() {
      useSlideErrorBoundary(components)
      return () => h('div', slides.value.map(slide => h('section', { key: slide.key }, [h(Content, { slide, metadata: {} })])))
    },
  })
  createApp({
    setup() {
      provide(SLIDE_RENDER_FAILURES, (owner, failures) => {
        if (failures.length)
          reports.set(owner, failures)
        else
          reports.delete(owner)
      })
      return () => h(Deck)
    },
  }).mount(root)
  return {
    root,
    slides,
    failures: () => [...reports.values()].flat().map(({ slide, names, index }) => ({ slide: slide.key, names, index })),
  }
}

describe('useSlideErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('draws the slide without the component that throws, and draws it again once its text renders', async () => {
    const deck = mountDeck([{ key: 'one', icon: 'a' }, { key: 'two' }])
    expect(textOf(deck.root)).toBe('one [OK][A]two [OK]')
    await nextTick()
    expect(deck.failures()).toEqual([{ slide: 'two', names: ['i', 'IconInline'], index: 1 }])

    deck.slides.value = [deck.slides.value[0]!, { key: 'two again', icon: 'b' }]
    await nextTick()
    expect(textOf(deck.root)).toBe('one [OK][A]two again [OK][B]')
    expect(deck.failures()).toEqual([])
  })

  it('lists once a component that throws, in it or in a child, at each render of its slide', async () => {
    const deck = mountDeck([{ key: 'one', icon: 'a', box: undefined }])
    await nextTick()
    for (const _ of [1, 2]) {
      deck.slides.value = [...deck.slides.value]
      await nextTick()
      await nextTick()
    }
    expect(deck.failures()).toEqual([{ slide: 'one', names: ['Box'], index: 0 }])
  })

  it('draws the other slides when a slide throws itself', async () => {
    const deck = mountDeck([{ key: 'one', icon: 'a' }, { key: 'two', broken: true }])
    expect(textOf(deck.root)).toBe('one [OK][A]')
    await nextTick()
    expect(deck.failures()).toEqual([{ slide: 'two', names: ['Content'], index: 0 }])
  })

  it('lists a component whose setup throws', async () => {
    const deck = mountDeck([{ key: 'one', icon: 'a', extra: 'Chart' }])
    await nextTick()
    expect(deck.failures()).toEqual([{ slide: 'one', names: ['Chart'], index: 0 }])
  })

  it('leaves out a component that stays drawn after its error', async () => {
    const deck = mountDeck([{ key: 'one', icon: 'a', extra: 'Clock' }])
    await nextTick()
    expect(textOf(deck.root)).toBe('one [OK][A]now')
    expect(deck.failures()).toEqual([])
  })

  it('leaves out a component the next render of the deck finds drawn again', async () => {
    ready.value = false
    const deck = mountDeck([{ key: 'one', icon: 'a', extra: 'Feed' }])
    await nextTick()
    expect(deck.failures()).toEqual([{ slide: 'one', names: ['Feed'], index: 0 }])
    ready.value = true
    deck.slides.value = [...deck.slides.value]
    await nextTick()
    expect(textOf(deck.root)).toBe('one [OK][A]feed')
    expect(deck.failures()).toEqual([])
  })
})
