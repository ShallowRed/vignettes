/** A description cut into its text and its `code` spans, which the descriptions write between backticks. */
export function codeParts(text: string): { text: string, code: boolean }[] {
  return text.split('`').map((part, index) => ({ text: part, code: index % 2 === 1 })).filter(part => part.text)
}
