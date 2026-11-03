// The members of the object Reveal passes to a plugin's `init` that the plugin uses.
interface RevealDeck {
  on: (type: string, listener: () => void) => void
  off: (type: string, listener: () => void) => void
  getSlidesElement: () => HTMLElement
}

/**
 * Reveal plugin that keeps the keyboard on the deck while a frame of a slide
 * runs a script that focuses its own page, as a Storybook story with a `play`
 * function does. Reveal reads its keys on the document, and a focused frame
 * receives them instead.
 *
 * A frame of a slide takes the pointer once a click activates it (the
 * `data-frame-active` attribute, styled by `RevealPresentation`); a frame
 * inside a link stays inert, so the click reaches the link. The focus that a
 * frame takes without being active goes back to the element of the page that
 * held it, the editor in the studio, or to the page. A pointer back on the
 * page, a click outside the frame or a change of slide ends the activation.
 * Tab reaches a frame as any other control, and activates it.
 *
 * The frozen bundle inlines the source of this function, so its body refers to
 * nothing outside it.
 */
export function frameFocus() {
  let teardown = () => {}
  return {
    id: 'frame-focus',
    init(deck: RevealDeck) {
      const slides = deck.getSlidesElement()
      let active: HTMLIFrameElement | null = null
      let held: HTMLElement | null = null
      let tabbedAt = Number.NEGATIVE_INFINITY

      const isFrame = (node: unknown): node is HTMLIFrameElement =>
        node instanceof HTMLIFrameElement && slides.contains(node)

      const giveBack = (frame: HTMLIFrameElement) => {
        if (document.activeElement !== frame)
          return
        if (held?.isConnected)
          held.focus({ preventScroll: true })
        else
          frame.blur()
      }

      const activate = (frame: HTMLIFrameElement) => {
        active = frame
        frame.setAttribute('data-frame-active', '')
      }

      const deactivate = () => {
        const frame = active
        if (!frame)
          return
        active = null
        frame.removeAttribute('data-frame-active')
        giveBack(frame)
      }

      // The frame under the pointer, which the pointer passes through to its container.
      const frameAt = (event: PointerEvent) => {
        const target = event.target as Element | null
        return Array.from(slides.querySelectorAll('section.present:not(.stack) iframe')).find((frame) => {
          if (frame.closest('a') || !target?.contains(frame))
            return false
          const box = frame.getBoundingClientRect()
          return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
        }) as HTMLIFrameElement | undefined
      }

      const onFocusIn = (event: FocusEvent) => {
        if (!(event.target instanceof HTMLIFrameElement))
          held = event.target as HTMLElement
      }

      const frameInFocus = () => {
        const frame = document.activeElement
        return isFrame(frame) && frame !== active ? frame : undefined
      }

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Tab')
          tabbedAt = performance.now()
      }

      // Chromium blurs the window when a frame takes the focus. Firefox does
      // not, nor does a window that lacks the focus when the frame takes it,
      // so the plugin also checks the focus four times a second. A frame of
      // another origin takes the focus a moment after Tab: the frame focused
      // within half a second of a Tab is active.
      const guard = () => {
        const frame = frameInFocus()
        if (!frame)
          return
        if (performance.now() - tabbedAt < 500)
          activate(frame)
        else
          giveBack(frame)
      }
      const onWindowBlur = () => setTimeout(guard, 0)
      const check = setInterval(guard, 250)

      const onPointerDown = (event: PointerEvent) => {
        const frame = frameAt(event)
        if (frame === active)
          return
        deactivate()
        if (frame)
          activate(frame)
      }

      // The page receives pointer events only while the pointer is outside its frames.
      const onPointerOver = (event: PointerEvent) => {
        if (active && event.target !== active)
          deactivate()
      }

      document.addEventListener('focusin', onFocusIn, true)
      document.addEventListener('keydown', onKeyDown, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('pointerover', onPointerOver, true)
      window.addEventListener('blur', onWindowBlur)
      deck.on('slidechanged', deactivate)

      teardown = () => {
        clearInterval(check)
        document.removeEventListener('focusin', onFocusIn, true)
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('pointerdown', onPointerDown, true)
        document.removeEventListener('pointerover', onPointerOver, true)
        window.removeEventListener('blur', onWindowBlur)
        deck.off('slidechanged', deactivate)
      }
    },
    destroy() {
      teardown()
    },
  }
}
