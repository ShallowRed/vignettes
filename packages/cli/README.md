# @vignettes/cli

The command line of Vignettes. `vignettes check` reads deck files and reports the problems the studio reports in its editor, without network and without writing a file.

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

## Exit codes

- 0: no file has an error.
- 1: a file has an error.
- 2: a usage error, such as an unknown option or command, a missing file or a file that cannot be read.
- 70: an internal error of the command line.
- 130: stopped by Ctrl+C.

## Trying it from the repository

```bash
pnpm --filter @vignettes/cli build
node packages/cli/dist/cli.mjs check examples/controle-du-theme.md
```

The build writes one file, `dist/cli.mjs`, that holds the code of `@vignettes/core`, `@vignettes/schemas` and `@vignettes/storybook`. `node packages/cli/src/cli.ts` runs the sources without a build.
