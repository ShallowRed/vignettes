import type { ComponentInternalInstance, VNode } from 'vue'
import type { SlideRenderFailure } from '../config/injection-keys.ts'
import type { Slide } from '../types/presentation.ts'
import { Comment, getCurrentInstance, inject, nextTick, onBeforeUnmount, onErrorCaptured, onUpdated } from 'vue'
import { SLIDE_RENDER_FAILURES } from '../config/injection-keys.ts'

/**
 * The error boundary of the slides of a deck, for the component that renders
 * them, each slide as a child component with a `slide` prop. A component of a
 * slide that throws while it sets up or renders draws nothing, and the rest of
 * the slide and of the deck draws. The error goes to the console. The page
 * that provides `SLIDE_RENDER_FAILURES` receives the components that draw
 * nothing after an error, until a render of the deck finds them drawn again or
 * gone: an error of a lifecycle hook, a watcher or an event handler, after
 * which the component stays drawn, goes to the console alone. A slide whose
 * text changes is mounted again (`slideKeys`), so the next text that renders
 * replaces the failed component.
 */
export function useSlideErrorBoundary(components: Record<string, unknown>): void {
  const report = inject(SLIDE_RENDER_FAILURES, undefined)
  const boundary = getCurrentInstance()!
  const owner = Symbol('deck')
  // One entry per deck component that failed, by its instance: a component
  // whose render throws again, in it or in one of its children, replaces its entry.
  const failed = new Map<ComponentInternalInstance, { slide: ComponentInternalInstance, failing: ComponentInternalInstance, failure: Omit<SlideRenderFailure, 'slide'> }>()

  function send() {
    for (const [holder, { failing }] of failed) {
      if (!drawsNothing(failing))
        failed.delete(holder)
    }
    report!(owner, [...failed.values()].map(({ slide, failure }) => ({ slide: slide.props.slide as Slide, ...failure })))
  }

  onErrorCaptured((error, instance) => {
    console.error(error)
    if (!report)
      return false
    // The rank of the component reads the whole slide, drawn once the render ends.
    void nextTick(() => {
      const failing = instance?.$
      let slide: ComponentInternalInstance | null | undefined = failing
      while (slide && slide.parent !== boundary)
        slide = slide.parent
      if (boundary.isUnmounted || !failing || !slide || !drawsNothing(failing))
        return
      const { holder, ...written } = writtenComponent(slide, failing, components)
      failed.set(holder, { slide, failing, failure: written })
      send()
    })
    // Vue draws an empty node in place of the component and stops the error here.
    return false
  })

  // A new render of the deck unmounts the slides whose text changed, gives the
  // others their new slide, and draws again the components it updates.
  onUpdated(() => {
    if (failed.size)
      send()
  })

  onBeforeUnmount(() => {
    if (failed.size)
      report?.(owner, [])
  })
}

/** Whether a mounted instance draws the empty node Vue puts in place of a render that throws. */
function drawsNothing(instance: ComponentInternalInstance): boolean {
  return !instance.isUnmounted && instance.subTree?.type === Comment
}

/**
 * The deck component that holds the failed instance: its instance, the names
 * it is written under and its rank among the components of its kind in the
 * slide; or the instance and its name, for a failure outside a deck component.
 */
function writtenComponent(slide: ComponentInternalInstance, instance: ComponentInternalInstance, components: Record<string, unknown>): Pick<SlideRenderFailure, 'names' | 'index'> & { holder: ComponentInternalInstance } {
  for (let holder: ComponentInternalInstance | null = instance; holder && holder !== slide; holder = holder.parent) {
    const type = holder.type
    const names = Object.keys(components).filter(name => components[name] === type)
    if (names.length)
      return { holder, names, index: Math.max(0, instancesOf(slide.subTree, type).indexOf(holder)) }
  }
  const name = instance.type.__name ?? instance.type.name
  return { holder: instance, names: name ? [name] : [], index: 0 }
}

/** The instances of a component in a rendered tree, in the order of the tree. */
function instancesOf(vnode: VNode, type: unknown): ComponentInternalInstance[] {
  const found: ComponentInternalInstance[] = []
  const visit = (node: VNode) => {
    if (node.component) {
      if (node.component.type === type)
        found.push(node.component)
      visit(node.component.subTree)
    }
    else if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === 'object')
          visit(child as VNode)
      }
    }
  }
  visit(vnode)
  return found
}
