// French orthotypography rules (framework-agnostic).
// U+202F thin no-break space before ; : ! ? and inside « »; U+00A0 no-break space
// for numbers/units and abbreviations.

export const ESPACE_FINE_INSECABLE = '\u202F'

export const ESPACE_INSECABLE = '\u00A0'

export const APOSTROPHE_TYPOGRAPHIQUE = '\u2019'

export const TIRET_CADRATIN = '—'

export const TIRET_DEMI_CADRATIN = '–'

export const POINTS_DE_SUSPENSION = '…'

export const GUILLEMET_OUVRANT = '«'
export const GUILLEMET_FERMANT = '»'

// Chars that must not get a thin space before punctuation (URLs, query params).
const CARACTERES_EXCLUS_AVANT_PONCTUATION = [
  '/',
  ':',
  '&',
  '=',
  ESPACE_FINE_INSECABLE,
  ESPACE_INSECABLE,
]

export function transformerTexte(texte: string): string {
  return texte
    .replace(/\.\.\./g, POINTS_DE_SUSPENSION)
    .replace(/---/g, TIRET_CADRATIN) // must run before the -- rule below
    .replace(/--/g, TIRET_DEMI_CADRATIN)
    .replace(/'/g, APOSTROPHE_TYPOGRAPHIQUE)
    .replace(/<<\s*/g, `${GUILLEMET_OUVRANT}${ESPACE_FINE_INSECABLE}`)
    .replace(/\s*>>/g, `${ESPACE_FINE_INSECABLE}${GUILLEMET_FERMANT}`)
    .replace(/«\s*/g, `${GUILLEMET_OUVRANT}${ESPACE_FINE_INSECABLE}`)
    .replace(/\s*»/g, `${ESPACE_FINE_INSECABLE}${GUILLEMET_FERMANT}`)
    .replace(/\s+([;:!?»])/g, `${ESPACE_FINE_INSECABLE}$1`)
    .replace(/(\S)([;:!?])/g, (correspondance, caracterePrecedent, ponctuation) => {
      if (CARACTERES_EXCLUS_AVANT_PONCTUATION.includes(caracterePrecedent)) {
        return correspondance
      }
      return `${caracterePrecedent}${ESPACE_FINE_INSECABLE}${ponctuation}`
    })
}
