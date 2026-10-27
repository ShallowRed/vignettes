import type { DeckMessages } from './deck-messages.ts'

/**
 * Each English text of the speaker view page of reveal.js 5.2.1, as the page
 * writes it, with the text in the language of the deck. The texts that the
 * inline script of the page writes stay JavaScript strings; the hashes of that
 * script in the content security policy follow these replacements.
 */
export const SPEAKER_VIEW_TEXTS: ReadonlyArray<readonly [string, (messages: DeckMessages) => string]> = [
  ['<title>reveal.js - Speaker View</title>', m => `<title>${m.speakerView}</title>`],
  ['Loading speaker view...', m => m.speakerViewLoading],
  ['>Upcoming<', m => `>${m.speakerUpcoming}<`],
  ['>Time <span class="reset-button">Click to Reset</span>', m => `>${m.speakerTime} <span class="reset-button">${m.speakerTimeReset}</span>`],
  ['Pacing – Time to finish current slide', m => m.speakerPacing],
  ['<h4 class="label">Notes</h4>', m => `<h4 class="label">${m.speakerNotes}</h4>`],
  ['\'Default\'', m => JSON.stringify(m.speakerLayoutDefault)],
  ['\'Wide\'', m => JSON.stringify(m.speakerLayoutWide)],
  ['\'Tall\'', m => JSON.stringify(m.speakerLayoutTall)],
  ['\'Notes only\'', m => JSON.stringify(m.speakerLayoutNotesOnly)],
  ['\'Layout\' + ( title ? ( \': \' + title ) : \'\' )', m => `${JSON.stringify(m.speakerLayout)} + ( title ? ' ' + title : '' )`],
  ['\'Cross origin error.<br>The speaker window can only be opened from the same origin.\'', m => JSON.stringify(m.speakerOtherOrigin)],
  ['\'Error connecting to main window.<br>Please try closing and reopening the speaker view.\'', m => JSON.stringify(m.speakerNoConnection)],
  ['\'en-US\', { hour12: true, hour: \'2-digit\', minute:\'2-digit\' }', m => `${JSON.stringify(m.timeLocale)}, { hour: '2-digit', minute: '2-digit' }`],
]

/** The speaker view page of reveal.js with its texts in the language of `messages`. */
export function speakerViewPage(page: string, messages: DeckMessages): string {
  return SPEAKER_VIEW_TEXTS.reduce((result, [english, text]) => result.replace(english, () => text(messages)), page)
}

interface NotesDeck {
  addKeyBinding: (binding: { keyCode: number, key: string, description: string }, callback: () => void) => void
}

/**
 * Whether the page is a frame of the speaker view, which loads the deck with
 * `receiver` in its address; the test is the one of Reveal's notes plugin.
 */
export function inSpeakerViewFrame(search: string): boolean {
  return /receiver/i.test(search)
}

export interface NotesPlugin {
  id: string
  init: (deck: NotesDeck) => void
  open: () => void
}

/**
 * Reveal's notes plugin with its speaker view in the language of the deck.
 * The plugin opens a blank window and writes the page of the speaker view in
 * it, from a string held in its module. While the plugin opens the window,
 * the wrapper translates the page it writes. `init` also runs inside the
 * translation, since the plugin opens the speaker view from `init` when the
 * address carries `?notes`, and the key the plugin binds opens the translated
 * view, with a description in the language of the deck.
 */
export function localizedNotes(notes: NotesPlugin, messages: DeckMessages): NotesPlugin {
  function translating(action: () => void) {
    const open = window.open
    window.open = (...args) => {
      const opened = open.apply(window, args)
      if (opened) {
        const write = opened.document.write.bind(opened.document)
        opened.document.write = (...pages: string[]) => write(...pages.map(page => speakerViewPage(page, messages)))
      }
      return opened
    }
    try {
      action()
    }
    finally {
      window.open = open
    }
  }
  const openTranslated = () => translating(notes.open)
  return {
    id: notes.id,
    init(deck) {
      const translatedDeck: NotesDeck = Object.create(deck)
      translatedDeck.addKeyBinding = (binding, callback) =>
        deck.addKeyBinding({ ...binding, description: messages.speakerView }, () => translating(callback))
      translating(() => notes.init(translatedDeck))
    },
    open: openTranslated,
  }
}
