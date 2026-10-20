import { defineNuxtPlugin } from '#imports'
// Loads the iframe scaler (`runtime/public/scaled-frame.js`); the same script is injected
// into the frozen bundle so scaling matches. JS, not CSS: Firefox `cqh` on grid
// items is unreliable.
export default defineNuxtPlugin(() => {
  if (document.getElementById('scaled-frame-js'))
    return
  const s = document.createElement('script')
  s.id = 'scaled-frame-js'
  s.src = '/scaled-frame.js'
  s.defer = true
  document.head.appendChild(s)
})
