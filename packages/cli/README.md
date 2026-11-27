# @vignettes/cli

The command line of Vignettes. `vignettes check` reads deck files and reports the problems the studio reports in its editor, without network and without writing a file. `vignettes login`, `whoami` and `logout` sign in to an instance with a personal token, show the account of the token and revoke it. `vignettes push` sends decks with their local images to an instance and publishes them.

```bash
npm install --global @vignettes/cli
vignettes check talk.md
```

`npx @vignettes/cli check talk.md` runs it without an installation. The package runs on macOS and Linux, with Node 22 or later. Its version is 0.x: under [Semantic Versioning](https://semver.org/#spec-item-4), the commands, the options, the JSON document and the codes may change at any release before 1.0.0.

## Checking a deck

```bash
vignettes check talk.md appendix.md
```

The command reads every file first, with the local images it cites, then checks each one with `checkDeck` of `@vignettes/core`, which knows the components built into the command line, those of `@vignettes/schemas` and `@vignettes/storybook` included. It also checks each image a deck cites by a path relative to its file: the image is read from the folder of the deck or one of its subfolders, symbolic links resolved, and an instance accepts its format and its weight. A file is read as UTF-8. It writes a line per problem, then a count:

```
talk.md:7:3  error  frontmatter  Value refused: this key takes a number, such as 1280.
talk.md:31:1  warning  unknown-component  Unknown component “Callout”: the studio shows its content without formatting.
1 file checked: 1 error, 1 warning, 0 info.
```

Each line gives the file, the line and the column from 1, the severity, the code of the problem and its message. An error breaks or drops content, a warning changes what the author probably meant, an info asks for a cleanup without effect on the slide.

With `--json`, the standard output holds one JSON document, and the columns count from 0:

```json
{
  "ok": false,
  "cli": "0.1.0",
  "command": "check",
  "instance": null,
  "results": [
    {
      "file": "talk.md",
      "problems": [
        { "line": 7, "column": 2, "severity": "error", "code": "frontmatter", "message": "Value refused: this key takes a number, such as 1280." }
      ]
    }
  ]
}
```

`ok` is true when no file has an error. A command that stops writes `{ "ok": false, "cli", "command", "instance", "error": { "code", "message" } }` instead, for example with the code `missing-file` for a file that does not exist. `--help` and `--version` write their text whatever the options.

## Codes of the problems

- `frontmatter`, error: the front matter has no closing line, its YAML cannot be read, it gives no title, or one of its values is refused.
- `malformed`, error: the attributes of a component cannot be read, for a missing brace or quote or for typographic quotes.
- `component-attribute`, warning: an attribute the component does not know, a value it reads otherwise than written, or an attribute it requires.
- `unclosed`, error: a component block open to the end of the text.
- `refused`, error: an address or an attribute binding the deck refuses, or an `http://` address the browser blocks in the studio.
- `layout-unknown-attribute` and `layout-invalid-value`, warnings: an attribute of `:layout` that it does not know, or a value outside its set.
- `layout-missing-source` and `layout-behind-needs-image`, errors: a media without an address, or a media behind the text that is not an image.
- `layout-unused`, info: an attribute of `:layout` without effect with this placement of the media.
- `legacy`, info: a form of an earlier version of the format, which the studio converts.
- `unknown-component`, warning: a component absent from the components built into the command line; the studio shows its content without formatting.
- `unknown-theme`, info: a theme absent from the themes built into the command line, which an instance may publish.
- `image-missing`, error: no file at the path of a local image, read from the folder of the deck.
- `image-outside-deck`, error: a local image whose path leads out of the folder of the deck and of its subfolders, symbolic links included; the command line reads none of its bytes.
- `image-unreadable`, error: a local image that the command line cannot read: a folder or another entry that is not a file, a file you have no right to read, or a path the system refuses.
- `image-type`, error: a local image whose bytes show none of the formats an instance accepts: PNG, JPG, WEBP, GIF, SVG or AVIF.
- `image-too-large`, error: a local image of more than 10 MB.
- `image-unplaced`, error: the path of a local image in the front matter written otherwise than in block style on the line of its key, which the command line cannot replace.
- `image-source-other`, warning: an image address that is neither a path relative to the deck, nor a path of the site, nor an `http://`, `https://` or `data:image` address.
- `image-unread`, warning: a relative path of an image written in HTML, in a markdown reference definition, or as the address of a page, which the command line leaves as written ([issue 22](https://github.com/ShallowRed/vignettes/issues/22)).
- `image-not-replaced`, warning: a relative path of an image that stays in the text sent to an instance, in a form the command line does not read.
- `deck-empty` and `deck-too-long`, errors: an empty deck, or a deck of more than 1,000,000 characters, which an instance refuses.
- `deck-body-too-large`, error: a deck whose request to an instance would weigh more than 2 MiB.

`push` gives these codes too, which come from the instance or from its options:

- `image-refused`, error: the instance refused a local image, with its message and its reason.
- `instance-refused`, error: the instance refused the request of a deck, with its message and the version of the command line.
- `uploaded-image-unknown`, warning: the file cites an image uploaded to an instance, `/media/<name>`, that no text of the deck on this instance cites: the image may come from another instance.
- `folder-ignored`, warning: `--folder` on a deck that exists, whose folder the command leaves as it is.
- `draft-online`, warning: the published version is the text sent, and the draft on the instance differs from it.
- `published-replaced`, warning: the publication replaces a published version that held another text, which the history of the studio keeps.

## Signing in to an instance

```bash
vignettes login --instance https://app.vignettes.io
vignettes whoami
vignettes logout
```

An instance is a Vignettes studio, named by its origin. `login` asks for a personal token without showing what you type; the studio creates the token on its Access tokens page. `--token-stdin` reads the token from the standard input, as in `vignettes login --instance https://app.vignettes.io --token-stdin < token.txt`. The command checks the token with the instance, then shows the account, its role, the scope of the token and its expiry. It keeps the token in the keyring of the system, the macOS Keychain or the Secret Service of Linux. When the keyring cannot keep it, the token goes into `credentials.json`, which your account alone can read, and the command says so on the standard error. It registers the instance in `config.json` under its host, or under the name `--name` gives, with the place of its token, the keyring or the file; the first instance registered is the default one. Both files are in `$XDG_CONFIG_HOME/vignettes`, `~/.config/vignettes` by default, and `config.json` holds no token. `login` stops on a registered instance: run `logout` first.

Each command reads the instance from `--instance`, an origin or the name of a registered instance, then from `VIGNETTES_INSTANCE`, then takes the default instance. It sends `VIGNETTES_TOKEN` when the variable is set, and otherwise the token kept for the instance, read at the place its registration names. When that place is the keyring and the keyring cannot be read, locked for example, `whoami` and `logout` stop and ask you to unlock it, without contacting the instance. If the keyring stays unreadable, revoke the token on the Access tokens page of the studio, then run `vignettes logout --local`. An origin starts with `https://`, or with `http://` for `localhost`, `127.0.0.1` and `[::1]`. The command line sends the token to this origin only: an instance that answers with a redirection stops the command, and the message names the address it redirects to.

`whoami` shows the instance, the account, its role, and the scope, the prefix and the expiry of the token. `logout` revokes the kept token on the instance, then erases it from the machine and removes the registered instance. When the instance refuses the token, revoked or expired already, `logout` erases it all the same. When the instance cannot be reached or answers with an error, or when the keyring cannot erase the token, the token and the registered instance stay on the machine, so that `logout` can run again. On a registered instance whose token is missing from its place, `whoami` stops and names `logout`, which removes the instance and exits with 0. `logout` stops while `VIGNETTES_TOKEN` is set, since it revokes the token kept on this machine.

`logout --local` removes the instance and its token from the machine without reading the token and without contacting the instance, for a keyring that stays unreadable or an instance that was shut down. The token stays valid on the instance until you revoke it on the Access tokens page of the studio; the command names it by its prefix on the standard error, and says so when the keyring cannot erase it.

With `--json`, with the `CI` variable set or without a terminal on the standard input, the commands ask no question: `login` then reads the token with `--token-stdin` only. The `instance` of the JSON document gives the origin of the instance.

## Publishing a deck

```bash
vignettes push talk.md --dry-run
vignettes push talk.md
```

`push` reads every file with its local images and checks them as `check` does. When a file has an error, it sends nothing and exits with 1. It then checks the token with the instance, reads the deck on the instance, and creates it when it does not exist, uploads each local image, saves the text as the draft and publishes it. The slug of a deck is the name of its file without `.md`, or `--slug` for a single file. A deck that the command creates goes into the folder that `--folder` or the `project` key of the front matter names, and stays private: you set its access in the studio. An account without a global role creates a deck in a folder where it has the editor grant. The text sent is the file where each local image is replaced by the address the instance gives it, `/media/<name>`; the file keeps its paths. `push` uploads each local image at each run, and an instance stores an image once under its name.

The command publishes a deck whose draft on the instance is its text, the draft of its creation or the published version. It stops on a draft that holds changes someone made in the studio, with the code 5: open the deck in the studio, or run the command again with `--force`, which first writes the replaced draft beside the file, as `<slug>.md.replaced-<stamp>`. That copy holds the draft of another person: do not commit it, and add the line `*.md.replaced-*` to the `.gitignore` of the repository of the decks. A deck open in the editor of the studio, or a draft saved by someone else between the read and the save, stops the deck with the code 5, and the command can run again. Each save and each publication carries the digest of the text it read or sends, and the instance refuses it when the draft holds another text. An instance that does not repeat that digest runs a version without the check: the command stops with the code 6, and the message names `vignettes pull` to read what the instance holds. Update the instance before pushing.

The decks go one after the other. A refusal of a deck, codes 1, 4 and 5, lets the next decks go; a refusal of the token or a failure of the instance, codes 3 and 6, stops the command, and the next decks are `skipped`. The command counts the requests it may send before the first one and stops above 300, the requests of a token an instance accepts in 5 minutes. It retries nothing: after a stop, run the same command again, and it resumes where it stopped.

`--dry-run` sends the reads alone. Each result of the JSON document gives `file`, `slug`, `action`, `url`, the address of the deck in the studio, `message`, `problems` and `warnings`, and `files`, the local images the command sent with the name the instance gives them, a line each in the text output. With `--dry-run`, `files` names the images the command would upload, and `writes` the writes it would send. The actions are `created`, `published`, `identical`, `unpublished-draft`, `creation-unfinished`, `live-session`, `conflict`, `exists`, `digest-unchecked`, `forbidden`, `refused`, `stopped` and `skipped`, and `create` and `publish` under `--dry-run`.

A rule of the command line can refuse a deck that a newer version accepts: update the command line before you report a refusal in an issue of https://github.com/ShallowRed/vignettes/issues. During a deployment that runs two containers, the instance sees the editor sessions of one container: a deck open in the editor on the other one is published with the text sent, and the session then saves its own text as the draft.

## Exit codes

- 0: success; for `check`, no file has an error.
- 1: a file has an error; for `push`, the instance also refused a deck or an image.
- 2: a usage error, such as an unknown option or command, a missing file, a file that cannot be read or is not UTF-8, a slug that `push` refuses, a folder that differs from the front matter, a deck to create without a folder for an account without a global role, a copy of a replaced draft that holds other bytes, more than 300 requests, a missing instance or token, a registered instance at `login`, a registered instance whose token is missing, a registration that another command dropped during `login`, or a keyring that cannot be read or cannot erase the token.
- 3: the instance refuses the token, which is unknown, revoked or expired, or refuses every token of this address for 10 minutes after 20 refused ones.
- 4: the instance refuses the request: the account or the scope of the token lacks the right, the deck is in the trash, or it asks for its password; for `push`, a token of the scope read, or a folder where the account may not create a deck.
- 5: for `push`, a draft on the instance that the command did not send, a deck open in the editor, a draft changed since the command read it or since it created the deck, a slug taken on the instance, or a creation that stopped before its access was set.
- 6: the instance cannot be reached, redirects, does not know the route, answers with an error, gives an answer the command line does not read, refuses a token over 300 requests in 5 minutes, or does not repeat the digest of the text `push` sent.
- 70: an internal error of the command line.
- 130: stopped by Ctrl+C.

## Trying it from the repository

```bash
pnpm --filter @vignettes/cli build
node packages/cli/dist/cli.mjs check examples/controle-du-theme.md
```

The build writes one file, `dist/cli.mjs`, that holds the code of `@vignettes/core`, `@vignettes/schemas` and `@vignettes/storybook`. `node packages/cli/src/cli.ts` runs the sources without a build.

`mise run dev` serves the studio of the repository over https through portless, at `https://vignettes-studio.localhost`, or `https://<branch>.vignettes-studio.localhost` in a worktree. Node trusts the certificate of portless when `NODE_EXTRA_CA_CERTS` names its authority, as the [portless README](https://github.com/vercel-labs/portless#readme) says:

```bash
NODE_EXTRA_CA_CERTS=~/.portless/ca.pem node packages/cli/dist/cli.mjs login --instance https://vignettes-studio.localhost
```
