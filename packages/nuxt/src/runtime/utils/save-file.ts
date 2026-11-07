/** Hands the browser a file to save. */
export function saveFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // The browser reads the address once the click returns.
  setTimeout(() => URL.revokeObjectURL(url))
}
