import { describe, expect, it } from 'vitest'
import { PROBE_REVEAL_CONFIG, probeRevealConfig } from '../../layers/studio/src/utils/layout-probe'

describe('probeRevealConfig', () => {
  it('keeps the hidden render off the keys, the address, the messages and the transitions', () => {
    expect(PROBE_REVEAL_CONFIG).toMatchObject({
      embedded: true,
      hash: false,
      history: false,
      respondToHashChanges: false,
      keyboard: false,
      postMessage: false,
      postMessageEvents: false,
      transition: 'none',
      backgroundTransition: 'none',
      scrollActivationWidth: null,
    })
  })

  it('takes the settings of the deck under its own', () => {
    const deck = { width: 1200, height: 800, transition: 'slide', hash: true, keyboard: true, scrollActivationWidth: 435 }
    expect(probeRevealConfig(deck)).toEqual({ ...PROBE_REVEAL_CONFIG, width: 1200, height: 800 })
  })
})
