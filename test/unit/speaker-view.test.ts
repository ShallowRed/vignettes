import type { NotesPlugin } from '@vignettes/core/render'
import { DECK_MESSAGES, localizedNotes, SPEAKER_VIEW_TEXTS, speakerViewPage } from '@vignettes/core/render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installedSpeakerView } from './helpers/fixtures'

describe('speakerViewPage', () => {
  it('finds each English text it translates in the installed reveal.js speaker view', () => {
    const page = installedSpeakerView()
    expect(SPEAKER_VIEW_TEXTS.filter(([english]) => !page.includes(english)).map(([english]) => english)).toEqual([])
  })

  it('writes the speaker view in French', () => {
    const page = speakerViewPage(installedSpeakerView(), DECK_MESSAGES.fr!)
    expect(page).toContain('<title>Vue conférencier</title>')
    expect(page).toContain('<h4 class="label">Temps <span class="reset-button">Cliquer pour remettre à zéro</span></h4>')
    expect(page).toContain('\'notes-only\': "Notes seules"')
    expect(page).toContain('toLocaleTimeString( "fr-FR", { hour: \'2-digit\', minute: \'2-digit\' } )')
    expect(page).not.toMatch(/Upcoming|Click to Reset|'Layout'|Disposition: |'en-US'/)
  })
})

describe('localizedNotes', () => {
  afterEach(() => vi.unstubAllGlobals())

  function speakerWindow() {
    const written: string[] = []
    const opened = { document: { write: (page: string) => written.push(page) } }
    const open = vi.fn(() => opened)
    vi.stubGlobal('window', { open })
    return { written, open }
  }

  function notesWritingOnOpen(): NotesPlugin {
    return {
      id: 'notes',
      init: () => {},
      open: () => window.open('about:blank', 'reveal.js - Notes')!.document.write('<title>reveal.js - Speaker View</title>'),
    }
  }

  it('translates the page the plugin writes into the window it opens', () => {
    const { written, open } = speakerWindow()
    localizedNotes(notesWritingOnOpen(), DECK_MESSAGES.fr!).open()
    expect(open).toHaveBeenCalledWith('about:blank', 'reveal.js - Notes')
    expect(written).toEqual(['<title>Vue conférencier</title>'])
    expect(window.open).toBe(open)
  })

  it('opens the translated speaker view from the key the plugin binds, with a description in the language of the deck', () => {
    const { written } = speakerWindow()
    const bindings = new Map<number, { description: string, callback: () => void }>()
    const deck = { addKeyBinding: (binding: { keyCode: number, description: string }, callback: () => void) => bindings.set(binding.keyCode, { description: binding.description, callback }) }
    const notes = notesWritingOnOpen()
    notes.init = deck => deck.addKeyBinding({ keyCode: 83, key: 'S', description: 'Speaker notes view' }, notes.open)
    localizedNotes(notes, DECK_MESSAGES.fr!).init(deck)
    expect(bindings.get(83)?.description).toBe('Vue conférencier')
    bindings.get(83)!.callback()
    expect(written).toEqual(['<title>Vue conférencier</title>'])
  })
})
