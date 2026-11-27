import type { ComponentAttributeIssue, DeckFileIssueReason, DeckProblem, FrontmatterProblem, LayoutMention } from '@vignettes/core/deck'
import type { PushAction, PushProblemCode } from './push-plan.ts'
import { inLanguage, LEGACY_FORMS, MAX_DECK_LENGTH, MAX_JSON_BODY_BYTES } from '@vignettes/core/deck'
import { IMAGE_FORMAT_NAMES, MAX_MEDIA_MEGABYTES } from '@vignettes/core/media'

type Problem<Check extends DeckProblem['check']> = Extract<DeckProblem, { check: Check }>

// A copy of the English sentences of the studio (layers/studio/i18n/locales/en/editor.json
// and catalog.json), without the help that points at the screen of the studio;
// test/unit/cli-commands.test.ts compares them.
const MALFORMED: Record<Problem<'malformed'>['reason'], (name: string) => string> = {
  brace: name => `Add the } brace that closes the attributes of “${name}”.`,
  quote: name => `Add the " quote that closes a value of “${name}”.`,
  typographic: name => `Replace the « » or “ ” quotes in the attributes of “${name}” with straight quotes ".`,
}

const COMPONENT_ATTRIBUTE: Record<ComponentAttributeIssue['kind'], (problem: ComponentAttributeIssue) => string> = {
  'unknown': ({ component, name }) => `Unknown attribute of ${component}: “${name}”.`,
  'false-text': ({ name }) => `${name}="false" is read as a text, so as true: write :${name}="false".`,
  'no-value': ({ component, name }) => `“${name}” has no value: ${component} ignores it. Write ${name}="…".`,
  'missing': ({ component, name }) => `${component} is missing the attribute “${name}”.`,
}

const REFUSED: Record<Problem<'refused'>['reason'], string> = {
  url: 'Address refused: write an address that starts with https://, or a path of this site that starts with /.',
  binding: 'Attribute refused: after “:”, write true, false, a number or a text between quotes, and remove v-bind, v-on, @ and v-model.',
  http: 'http:// address: the browser blocks this frame, image or video in the studio. Write the address with https://, or with http://localhost for a server on your computer.',
}

const EXPECTED: Record<NonNullable<FrontmatterProblem['expected']>, string> = {
  number: 'Value refused: this key takes a number, such as 1280.',
  boolean: 'Value refused: this key takes true or false.',
  string: 'Value refused: this key takes a text.',
}

const FRONTMATTER: Record<DeckFileIssueReason, (problem: FrontmatterProblem) => string> = {
  'unclosed': () => 'Open front matter: add a --- line above this heading to close it.',
  'unreadable': () => 'Unreadable front matter line: write one key per line, as key: value.',
  'no-title': () => 'The file\'s front matter gives no title: add the title key.',
  'address': () => REFUSED.url,
  'value': ({ key, expected, values }) => expected
    ? EXPECTED[expected]
    : values ? `Expected value: ${values.join(', ')}.` : `Value of “${key}” refused.`,
}

const LAYOUT: Record<LayoutMention['kind'], (attribute: string) => string> = {
  'unknown-attribute': attribute => `Unknown :layout attribute: “${attribute}”.`,
  'invalid-value': attribute => `Unknown value for “${attribute}”.`,
  'missing-source': () => 'Media without an address: add the src or story attribute.',
  'unused': attribute => `Remove “${attribute}”: this attribute has no effect with this placement of the media.`,
  'behind-needs-image': () => 'Behind the text, the media is an image: enter its address in src.',
}

/** One sentence per code of `PROBLEM_CODES`, in English. */
export function problemMessage(problem: DeckProblem): string {
  switch (problem.check) {
    case 'malformed':
      return MALFORMED[problem.reason](problem.name)
    case 'component-attribute':
      return COMPONENT_ATTRIBUTE[problem.kind](problem)
    case 'unclosed':
      return `Component ${problem.colons}${problem.name} open to the end of the text: add a ${problem.colons} line after its content. Without it, the slides that follow go into this component.`
    case 'refused':
      return REFUSED[problem.reason]
    case 'layout':
      return LAYOUT[problem.kind](problem.attribute)
    case 'legacy':
      return `${LEGACY_FORMS[problem.form].written}: ${inLanguage(LEGACY_FORMS[problem.form].description, 'en')}`
    case 'frontmatter':
      return FRONTMATTER[problem.reason](problem)
    case 'unknown-component':
      return `Unknown component “${problem.name}”: the studio shows its content without formatting.`
    case 'unknown-theme':
      return `The theme “${problem.theme}” is not among the themes built into the command line: an instance may publish it.`
    case 'image-missing':
      return `No image file at “${problem.value}”, read from the folder of the deck.`
    case 'image-outside-deck':
      return `“${problem.value}” leads out of the folder of the deck, symbolic links included: the command line reads the images of the folder of the deck and of its subfolders only. Move the image into it.`
    case 'image-unreadable':
      return `The command line cannot read “${problem.value}”: give the path of a file you have the right to read.`
    case 'image-type':
      return `The bytes of “${problem.value}” show none of the accepted formats: ${IMAGE_FORMAT_NAMES.join(', ')}.`
    case 'image-too-large':
      return `“${problem.value}” weighs more than ${MAX_MEDIA_MEGABYTES} MB, the largest image an instance accepts.`
    case 'image-source-other':
      return `“${problem.value}” is not an image address the command line reads: write a path relative to the deck, a path of the site such as /images/…, or an http://, https:// or data:image address.`
    case 'image-unread':
      return `${problem.value} stays as written in the text sent to the instance, which will not serve it: the command line uploads the images that a markdown image or an image attribute cites (https://github.com/ShallowRed/vignettes/issues/22).`
    case 'image-not-replaced':
      return `${problem.value} stays as written in the text sent to the instance, which will not serve it. If the slide shows it as an image, report the form of this line in an issue of https://github.com/ShallowRed/vignettes/issues; if it is a link to a file, publish the file elsewhere and link to its address.`
    case 'image-unplaced':
      return `The command line cannot replace “${problem.value}” in the text: write the value in block style, on the line of its key, without quotes or between plain quotes.`
    case 'deck-empty':
      return 'The file is empty: an instance refuses an empty deck.'
    case 'deck-too-long':
      return `The deck holds more than ${MAX_DECK_LENGTH} characters, the longest deck an instance accepts.`
    case 'deck-body-too-large':
      return `The request that sends this deck weighs ${problem.bytes} bytes, more than the ${MAX_JSON_BODY_BYTES} bytes an instance reads.`
  }
}

/** What the messages of `push` and `pull` name: the deck, its address in the studio, the instance and the version of the command line. */
export interface DeckContext {
  slug: string
  url: string
  origin: string
  cli: string
}

/** One sentence per code of `PUSH_PROBLEM_CODES`; `value` is the path, the message of the instance or the version the problem names. */
export function pushProblemMessage(code: PushProblemCode, value: string, deck: DeckContext): string {
  switch (code) {
    case 'image-refused':
      return `The instance refused the image ${value}. Command line ${deck.cli}.`
    case 'instance-refused':
      return `The instance refused ${deck.slug}: ${value}. Command line ${deck.cli}: update it before you report this refusal in an issue of https://github.com/ShallowRed/vignettes/issues.`
    case 'uploaded-image-unknown':
      return `${value} is an image uploaded to an instance, and no text of ${deck.slug} on ${deck.origin} cites it: it may come from another instance, which this one does not serve.`
    case 'folder-ignored':
      return `--folder leaves the folder of ${deck.slug} as it is, since the deck exists: move it in the studio.`
    case 'draft-online':
      return `The draft of ${deck.slug} on the instance differs from its published version, which is this text: open ${deck.url} to publish or discard it.`
    case 'published-replaced':
      return `The publication replaces the version ${value} of ${deck.slug}, which held another text; the history of the studio keeps it.`
  }
}

/** The refusal 413 of the request of a deck, with the message of the instance. */
export function bodyTooLargeMessage(deck: DeckContext, detail: string): string {
  return `The request that sends ${deck.slug} weighs more than the instance reads: ${detail}.`
}

/** The refusal of a deck that asks for its password. */
export function passwordMessage(deck: DeckContext): string {
  return `${deck.slug} asks for its password, which a token does not carry; open it in the studio.`
}

/** What `pull` does with a deck. */
export type PullAction = 'written' | 'identical' | 'local-differs' | 'forbidden' | 'refused' | 'stopped' | 'skipped'

/** The refusal 403 of the draft of a deck: frozen, archived, or shared for reading alone. */
export function readOnlyDraftMessage(deck: DeckContext): string {
  return `This account may not edit ${deck.slug}: the deck is frozen or archived, or shared with this account for reading alone.`
}

/** One sentence per action of the results of `pull`; `draft` names a read of the draft. */
export function pullActionMessage(action: PullAction, deck: DeckContext & { file: string, draft: boolean }): string {
  switch (action) {
    case 'written':
      return `Wrote ${deck.file} from the ${deck.draft ? 'draft' : 'published version'} of ${deck.slug}.`
    case 'identical':
      return `${deck.file} holds the ${deck.draft ? 'draft' : 'published version'} of ${deck.slug} already.`
    case 'local-differs':
      return `${deck.file} holds another text than the ${deck.draft ? 'draft' : 'published version'} of ${deck.slug}: commit or copy it, then run the command again with --force, which first copies it beside itself.`
    case 'forbidden':
      return deck.draft
        ? `No draft of ${deck.slug} that this account may edit: the deck does not exist, is in the trash, or is not shared with this account as an editor.`
        : `No published version of ${deck.slug} that this account may read: the deck does not exist, has no published version, is in the trash, or is not shared with this account.`
    case 'refused':
      return `${deck.file} was not written.`
    case 'stopped':
      return `The command stopped at ${deck.slug}.`
    case 'skipped':
      return `${deck.slug} was not read: the command stopped at an earlier deck.`
  }
}

/** One sentence per action of the results of `push`. */
export function pushActionMessage(action: PushAction, deck: DeckContext): string {
  switch (action) {
    case 'create':
      return `${deck.slug} would be created, then published.`
    case 'publish':
      return `${deck.slug} would be published.`
    case 'created':
      return `Created and published ${deck.slug}: ${deck.url}`
    case 'published':
      return `Published ${deck.slug}: ${deck.url}`
    case 'identical':
      return `The published version of ${deck.slug} is this text already: ${deck.url}`
    case 'unpublished-draft':
      return `The draft of ${deck.slug} on the instance holds changes this command did not send: open ${deck.url} in the studio, or run the command again with --force, which first writes a copy of that draft beside the file.`
    case 'creation-unfinished':
      return `The creation of ${deck.slug} stopped on the instance before its access was set; open ${deck.url} in the studio and set its access there, or remove the access keys from the file and run the command again.`
    case 'live-session':
      return `${deck.slug} is open in the editor of the studio, where the changes go through the session: wait until its editors leave it, then run the command again.`
    case 'conflict':
      return `Someone changed the draft of ${deck.slug} since this command read it: run the command again.`
    case 'exists':
      return `The slug ${deck.slug} is taken on the instance: the deck is in the trash, is not shared with this account, or has an empty draft. Open ${deck.url} in the studio, or ask an owner.`
    case 'digest-unchecked':
      return new CliError('digest-unchecked', deck.origin, deck.slug).message
    case 'forbidden':
      return `This account may not edit ${deck.slug} on the instance, or the deck is in the trash.`
    case 'refused':
      return `${deck.slug} was not sent: fix its errors, then run the command again. Command line ${deck.cli}.`
    case 'stopped':
      return `The command stopped at ${deck.slug}.`
    case 'skipped':
      return `${deck.slug} was not sent: the command stopped at an earlier deck.`
  }
}

export type CliErrorCode
  = | 'missing-command'
    | 'unknown-command'
    | 'unknown-option'
    | 'missing-option-value'
    | 'unexpected-option-value'
    | 'unexpected-operand'
    | 'missing-operand'
    | 'missing-file'
    | 'unreadable-file'
    | 'not-utf8'
    | 'unwritable-file'
    | 'pulled-link'
    | 'missing-instance'
    | 'unknown-instance'
    | 'invalid-instance'
    | 'insecure-instance'
    | 'unreadable-config'
    | 'keyring-unreadable'
    | 'secret-not-erased'
    | 'secret-missing'
    | 'registration-lost'
    | 'missing-token'
    | 'empty-token'
    | 'invalid-name'
    | 'name-taken'
    | 'already-signed-in'
    | 'not-signed-in'
    | 'not-registered'
    | 'token-in-environment'
    | 'token-refused'
    | 'token-forbidden'
    | 'route-unknown'
    | 'instance-redirect'
    | 'instance-unreachable'
    | 'instance-error'
    | 'instance-answer'
    | 'invalid-slug'
    | 'duplicate-slug'
    | 'slug-with-files'
    | 'folder-differs'
    | 'too-many-requests-planned'
    | 'read-scope'
    | 'folder-required'
    | 'folder-refused'
    | 'replaced-copy-differs'
    | 'too-many-token-requests'
    | 'too-many-invalid-tokens'
    | 'digest-unchecked'
    | 'media-name-differs'
    | 'internal'
    | 'interrupted'

const CLI_ERRORS: Record<CliErrorCode, (...details: string[]) => string> = {
  'missing-command': () => 'Name a command: run vignettes --help for the list.',
  'unknown-command': name => `Unknown command “${name}”: run vignettes --help for the list.`,
  'unknown-option': name => `Unknown option “${name}”: run the command with --help for its options.`,
  'missing-option-value': name => `The option “${name}” takes a value: write ${name} <value>.`,
  'unexpected-option-value': name => `The option “${name}” takes no value.`,
  'unexpected-operand': operand => `Unexpected argument “${operand}”: this command takes no file or name after it.`,
  'missing-operand': operand => `Give at least one <${operand}> after the command.`,
  'missing-file': file => `The file “${file}” does not exist.`,
  'unreadable-file': file => `The file “${file}” cannot be read.`,
  'not-utf8': file => `The file “${file}” is not written in UTF-8: save it in UTF-8, the encoding the studio reads.`,
  'unwritable-file': file => `The command line cannot write the file “${file}”.`,
  'pulled-link': file => `“${file}” is a symbolic link: the command line writes a pulled deck to a file of the folder alone. Remove the link, or give another folder with --out.`,
  'missing-instance': () => 'Name the instance with --instance <origin or name> or VIGNETTES_INSTANCE, or sign in with vignettes login --instance <origin>.',
  'unknown-instance': name => `No registered instance is named “${name}”: give its origin, such as https://app.vignettes.io, or sign in to it with vignettes login.`,
  'invalid-instance': address => `“${address}” is not an address: write the origin of the instance, such as https://app.vignettes.io.`,
  'insecure-instance': address => `The address “${address}” does not start with https://: the command line sends a token over https only, or over http to localhost, 127.0.0.1 and [::1].`,
  'unreadable-config': file => `The file “${file}” cannot be read: fix or remove it.`,
  'keyring-unreadable': (origin, prefix) => `The keyring of the system holds the token ${prefix} of “${origin}” and cannot be read: unlock it, then run the command again. If it stays unreadable, revoke the token on the Access tokens page of the studio, then run vignettes logout --instance ${origin} --local.`,
  'secret-not-erased': origin => `The keyring of the system cannot erase the token of “${origin}”, which stays on this machine: unlock the keyring, then run vignettes logout again, or vignettes logout --instance ${origin} --local if it stays unreadable.`,
  'secret-missing': (origin, prefix) => `The instance “${origin}” is registered on this machine and its token ${prefix} is missing: run vignettes logout --instance ${origin}, then vignettes login --instance ${origin}.`,
  'registration-lost': (file, name, prefix) => `Another command rewrote ${file} at the same time, so “${name}” is not registered: revoke the token ${prefix} on the Access tokens page of the studio, then run vignettes login again.`,
  'missing-token': () => 'Give the token on the standard input with --token-stdin: the command asks no question with --json, with CI set or without a terminal.',
  'empty-token': () => 'The token is empty: paste the token the studio showed when you created it.',
  'invalid-name': name => `“${name}” cannot name an instance: write a name without “://” after --name.`,
  'name-taken': (name, origin) => `The name “${name}” stands for “${origin}” already: choose another one with --name.`,
  'already-signed-in': origin => `The instance “${origin}” is registered on this machine already: run vignettes logout --instance ${origin} first.`,
  'not-signed-in': origin => `No token of “${origin}” is kept on this machine: run vignettes login --instance ${origin}, or set VIGNETTES_TOKEN.`,
  'not-registered': origin => `No instance “${origin}” is registered on this machine.`,
  'token-in-environment': () => 'VIGNETTES_TOKEN is set: unset it before vignettes logout, which revokes the token kept on this machine.',
  'token-refused': origin => `The instance “${origin}” refuses the token: the token is unknown, revoked or expired.`,
  'token-forbidden': origin => `The instance “${origin}” refuses this request to the token: its account or its scope lacks the right.`,
  'route-unknown': (origin, path) => `The instance “${origin}” does not know the route ${path}: check that the address is the origin of the instance.`,
  'instance-redirect': (origin, location) => `The instance “${origin}” redirects to “${location}”: the command line sends the token to the origin it was given only, so give the origin of the instance itself.`,
  'instance-unreachable': (origin, code) => `The instance “${origin}” cannot be reached (${code}).`,
  'instance-error': (origin, status) => `The instance “${origin}” answered with the status ${status}.`,
  'instance-answer': (origin, path) => `The answer of “${origin}” to ${path} has a form the command line does not read: the instance may run another version of Vignettes.`,
  'invalid-slug': (file, slug) => `“${slug}” cannot be the slug of ${file}: a slug holds letters, digits, dashes and underscores, and starts with a letter or a digit. Rename the file, or give --slug <slug> for a single file.`,
  'duplicate-slug': slug => `Two files have the slug “${slug}”, letter case aside: push them under different names.`,
  'slug-with-files': () => '--slug names the deck of a single file: give one file with it.',
  'folder-differs': (file, folder, project) => `--folder names “${folder}” and the front matter of ${file} names “${project}”: give one folder.`,
  'too-many-requests-planned': (count, limit) => `This command would send up to ${count} requests, and an instance accepts ${limit} requests of a token in 5 minutes: push fewer decks at a time.`,
  'read-scope': origin => `The token sent to “${origin}” has the scope read, which publishes nothing: create a token of the scope write in the studio, or run the command with --dry-run.`,
  'folder-required': slug => `${slug} does not exist on the instance, and an account without a global role creates a deck in a folder: give --folder <folder>, or the project key of the front matter.`,
  'folder-refused': (origin, folder) => `The instance “${origin}” has no folder “${folder}” in which this account may create a deck.`,
  'replaced-copy-differs': file => `${file} exists and holds another text than the draft this command would replace: move it, then run the command again.`,
  'too-many-token-requests': () => 'This token sent more than 300 requests in 5 minutes: wait 5 minutes, then run the same command again; it resumes where it stopped.',
  'too-many-invalid-tokens': () => 'This address sent 20 refused tokens in 10 minutes, and the instance refuses every token from it for 10 minutes: check VIGNETTES_TOKEN or run vignettes login, then wait 10 minutes.',
  'digest-unchecked': (origin, slug) => `The instance ${origin} did not confirm the digest of the text this command sent, so it may run a version without this check: update the instance before pushing. The draft of ${slug} may hold the sent text, and its published version may differ from it; run vignettes pull ${slug} to read the published version, and vignettes pull ${slug} --draft to read the draft.`,
  'media-name-differs': () => 'The instance names images differently from this version of the command line; update it.',
  'internal': detail => `Internal error of the command line: ${detail}`,
  'interrupted': () => 'Stopped by Ctrl+C.',
}

/** An issue of a command, by its code; `details` name what the message is about. */
export class CliError extends Error {
  readonly code: CliErrorCode

  constructor(code: CliErrorCode, ...details: string[]) {
    super(CLI_ERRORS[code](...details))
    this.code = code
  }
}
