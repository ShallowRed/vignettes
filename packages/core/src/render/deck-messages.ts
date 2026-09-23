/**
 * The texts of the deck chrome (controls, loading veil, print overlay, enlarge
 * hints). They follow the language of the deck, not the language of the host
 * interface, and ship with the renderer so a frozen bundle has them.
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
  printPreparing: string
  printHint: string
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
  printPreparing: 'Préparation de l’export PDF…',
  printHint: 'La fenêtre d’impression s’ouvre automatiquement : choisissez « Enregistrer au format PDF ».',
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
  printPreparing: 'Preparing the PDF export…',
  printHint: 'The print dialog opens automatically: choose “Save as PDF”.',
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
}

export const DECK_MESSAGES: Record<string, DeckMessages> = { fr: FR, en: EN }

/** The chrome texts for a deck language (`fr-FR`, `en`…); French when the language is absent or unknown. */
export function deckMessages(lang?: string): DeckMessages {
  return DECK_MESSAGES[lang?.toLowerCase().split('-')[0] ?? 'fr'] ?? FR
}
