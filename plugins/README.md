# Vignettes plugins

Agent skills for [Vignettes](https://vignettes.io), the presentation engine built on Nuxt, MDC and reveal.js. The `writing-decks` skill of the `vignettes-decks` plugin writes and edits a Vignettes deck: its outline and slide text for the purpose of the deck, its frontmatter, its components, its layouts and its live Storybook embeds. The deck is a Markdown file that you import into a Vignettes studio. The `writing-themes` skill of the `vignettes-themes` plugin writes a theme in a clone of this repository.

## Install

In Claude Code:

```text
/plugin marketplace add ShallowRed/vignettes
/plugin install vignettes-decks@vignettes
```

On a computer without an SSH key for GitHub, start Claude Code with `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`. `/plugin marketplace update vignettes` installs the latest version; to update on its own, turn on auto-update for the `vignettes` marketplace in `/plugin`, tab Marketplaces.

For Codex, GitHub Copilot, Cursor, Gemini CLI and the other agents that read the [Agent Skills](https://agentskills.io) format, with GitHub CLI:

```bash
gh skill install ShallowRed/vignettes writing-decks --agent codex --scope user
```

The [Vignettes documentation](https://vignettes.io/docs/ecrire/ecrire-avec-un-agent) explains, in French, how to have an agent write a deck and how to import it.
