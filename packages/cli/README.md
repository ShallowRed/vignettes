# @vignettes/cli

The command line of Vignettes. `vignettes check` reads deck files and reports the problems the studio reports in its editor, without network and without writing a file. `vignettes login`, `whoami` and `logout` sign in to an instance with a personal token, show the account of the token and revoke it.

```bash
npm install --global @vignettes/cli
vignettes check talk.md
```

`npx @vignettes/cli check talk.md` runs it without an installation. The package runs on macOS and Linux, with Node 22 or later. Its version is 0.x: under [Semantic Versioning](https://semver.org/#spec-item-4), the commands, the options, the JSON document and the codes may change at any release before 1.0.0.

## Checking a deck

```bash
vignettes check talk.md appendix.md
```

The command reads every file first, then checks each one with `checkDeck` of `@vignettes/core`, which knows the components built into the command line, those of `@vignettes/schemas` and `@vignettes/storybook` included. It writes a line per problem, then a count:

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

## Exit codes

- 0: success; for `check`, no file has an error.
- 1: a file has an error.
- 2: a usage error, such as an unknown option or command, a missing file or a file that cannot be read, a missing instance or token, a registered instance at `login`, a registered instance whose token is missing, a registration that another command dropped during `login`, or a keyring that cannot be read or cannot erase the token.
- 3: the instance refuses the token, which is unknown, revoked or expired.
- 4: the instance refuses the request: the account or the scope of the token lacks the right.
- 6: the instance cannot be reached, redirects, does not know the route, answers with an error, or gives an answer the command line does not read.
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
