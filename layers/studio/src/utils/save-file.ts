import { saveFile } from '@vignettes/nuxt/save-file'

/** Hands the browser a file to save, built from text the page holds. */
export function saveTextFile(name: string, text: string, type: string) {
  saveFile(name, new Blob([text], { type }))
}
