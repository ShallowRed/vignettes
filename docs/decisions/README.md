# Decisions

The decisions that shape the code of Vignettes, one per file. [0000](0000-recording-decisions.md) says what goes in a decision and how we write it, and [docs/design](../design/README.md) holds the decisions of interface design.

- [0000](0000-recording-decisions.md) Recording a decision.
- [0001](0001-deck-format-in-the-core.md) We define the deck format once, in the core.
- [0002](0002-storage-behind-ports.md) The studio reaches its rows through ports, with PostgreSQL by default.
- [0003](0003-separate-deck-origin.md) We serve deck pages from an origin on another registrable domain.
- [0004](0004-one-process-per-instance.md) An instance runs as one process.
- [0005](0005-earlier-forms-stay-readable.md) Earlier forms of the format stay readable, without a version of the syntax.
- [0006](0006-adapter-keys-under-their-adapter.md) We write the keys of an adapter under the key of that adapter.
- [0022](0022-digest-of-a-publication-and-a-save.md) A publication and a save check the digest of the text they expect.
- [0023](0023-publication-by-an-account-without-a-global-role.md) A publication by an account without a global role sets no access from its text.
