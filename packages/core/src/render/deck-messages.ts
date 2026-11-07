/**
 * The texts of the deck chrome (controls, loading veil, print overlay, enlarge
 * hints, an embed without a source, speaker view). They follow the language of the deck,
 * not the language of the host interface, and ship with the renderer so a
 * frozen bundle has them.
 */
export interface DeckMessages {
  loading: string
  controls: string
  showControls: string
  overview: string
  speakerView: string
  enterFullscreen: string
  exitFullscreen: string
  copyLink: string
  linkCopied: string
  print: string
  /** The name of a part of a file whose deck has no title. */
  untitled: string
  printPreparing: string
  printHint: string
  printReady: string
  printUnsupported: string
  printUnsupportedHint: string
  printReopen: string
  printBack: string
  enlarge: string
  enlargeDiagram: string
  fullscreen: string
  zoomOut: string
  zoomIn: string
  zoomReset: string
  close: string
  storyMissing: string
  speakerViewLoading: string
  speakerUpcoming: string
  speakerTime: string
  speakerTimeReset: string
  speakerPacing: string
  speakerNotes: string
  /** The label of the layout menu, before the name of the layout. */
  speakerLayout: string
  speakerLayoutDefault: string
  speakerLayoutWide: string
  speakerLayoutTall: string
  speakerLayoutNotesOnly: string
  speakerOtherOrigin: string
  speakerNoConnection: string
  /** The locale of the clock of the speaker view. */
  timeLocale: string
}

const FR: DeckMessages = {
  loading: 'Chargement de la présentation',
  controls: 'Commandes de la présentation',
  showControls: 'Afficher les commandes',
  overview: 'Vue d’ensemble',
  speakerView: 'Vue conférencier',
  enterFullscreen: 'Plein écran',
  exitFullscreen: 'Quitter le plein écran',
  copyLink: 'Copier le lien de cette diapositive',
  linkCopied: 'Lien copié',
  print: 'Imprimer ou exporter en PDF',
  untitled: 'Sans titre',
  printPreparing: 'Préparation de l’export PDF…',
  printHint: 'La fenêtre d’impression s’ouvre automatiquement : choisissez « Enregistrer au format PDF ».',
  printReady: 'Les pages sont prêtes pour l’export PDF',
  printUnsupported: 'L’export PDF fonctionne dans Chrome, Edge ou Brave',
  printUnsupportedHint: 'Ouvrez cette page dans l’un de ces navigateurs, puis choisissez « Enregistrer au format PDF ».',
  printReopen: 'Rouvrir la fenêtre d’impression',
  printBack: 'Revenir à la présentation',
  enlarge: 'Cliquer pour agrandir',
  enlargeDiagram: 'Agrandir le diagramme',
  fullscreen: 'Plein écran',
  zoomOut: 'Zoom arrière',
  zoomIn: 'Zoom avant',
  zoomReset: 'Réinitialiser',
  close: 'Fermer',
  storyMissing: 'Indiquez une story, avec la clé storybook dans l\'en-tête de la présentation, ou une adresse dans src.',
  speakerViewLoading: 'Chargement de la vue conférencier…',
  speakerUpcoming: 'Diapositive suivante',
  speakerTime: 'Temps',
  speakerTimeReset: 'Cliquer pour remettre à zéro',
  speakerPacing: 'Temps restant pour cette diapositive',
  speakerNotes: 'Notes',
  speakerLayout: 'Disposition\u00A0:',
  speakerLayoutDefault: 'Par défaut',
  speakerLayoutWide: 'Large',
  speakerLayoutTall: 'En hauteur',
  speakerLayoutNotesOnly: 'Notes seules',
  speakerOtherOrigin: 'Ouvrez la vue conférencier depuis la présentation, avec la touche S.',
  speakerNoConnection: 'La vue conférencier n’arrive pas à se connecter à la présentation. Fermez cette fenêtre, puis rouvrez la vue conférencier.',
  timeLocale: 'fr-FR',
}

const EN: DeckMessages = {
  loading: 'Loading the presentation',
  controls: 'Presentation controls',
  showControls: 'Show the controls',
  overview: 'Overview',
  speakerView: 'Speaker view',
  enterFullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  copyLink: 'Copy the link to this slide',
  linkCopied: 'Link copied',
  print: 'Print or export to PDF',
  untitled: 'Untitled',
  printPreparing: 'Preparing the PDF export…',
  printHint: 'The print dialog opens automatically: choose “Save as PDF”.',
  printReady: 'The pages are ready for the PDF export',
  printUnsupported: 'PDF export works in Chrome, Edge or Brave',
  printUnsupportedHint: 'Open this page in one of these browsers, then choose “Save as PDF”.',
  printReopen: 'Reopen the print dialog',
  printBack: 'Back to the presentation',
  enlarge: 'Click to enlarge',
  enlargeDiagram: 'Enlarge the diagram',
  fullscreen: 'Full screen',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomReset: 'Reset',
  close: 'Close',
  storyMissing: 'Set a story, with the storybook key in the deck header, or an address in src.',
  speakerViewLoading: 'Loading the speaker view…',
  speakerUpcoming: 'Next slide',
  speakerTime: 'Time',
  speakerTimeReset: 'Click to reset',
  speakerPacing: 'Time left for this slide',
  speakerNotes: 'Notes',
  speakerLayout: 'Layout:',
  speakerLayoutDefault: 'Default',
  speakerLayoutWide: 'Wide',
  speakerLayoutTall: 'Tall',
  speakerLayoutNotesOnly: 'Notes only',
  speakerOtherOrigin: 'Open the speaker view from the presentation, with the S key.',
  speakerNoConnection: 'The presentation cannot be reached. Close this window, then reopen the speaker view.',
  timeLocale: 'en-US',
}

export const DECK_MESSAGES: Record<string, DeckMessages> = { fr: FR, en: EN }

/** The primary subtag of a deck language, lowercased (`fr` for `fr-FR`); French when the language is absent. */
export function deckLanguage(lang?: string): string {
  return lang?.toLowerCase().split('-')[0] || 'fr'
}

/** The chrome texts for a deck language (`fr-FR`, `en`…); French when the language is absent or unknown. */
export function deckMessages(lang?: string): DeckMessages {
  return DECK_MESSAGES[deckLanguage(lang)] ?? FR
}
