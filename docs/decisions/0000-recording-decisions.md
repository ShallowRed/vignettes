---
status: proposed
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0000 Recording a decision

## Context and problem

Where does a coding agent, or a person who joins the project, find a decision that shapes the code of Vignettes, its reasons, and the check that tells whether the code still applies it? Agents write most of the code, read the instructions of the repository at every task, and work in worktrees that hold only the files git tracks. When nobody finds a decision, we discuss it again, and an agent writes code that contradicts it.

## Considered options

- A section of `AGENTS.md`, one sentence per decision. Set aside because one sentence has no room for the options set aside and the consequences, and every session loads the whole file.
- The architecture contracts of `ai-harness/memoire/vignettes/`, which the `contract` skill writes. Set aside because a contract holds the decision together with the plan of a set of commits and the history of its versions, and it is outside the repository.
- The private notes of `docs/private/`. Set aside because git ignores that folder: the notes have no history and are absent from the worktrees where agents work.
- Writing the decisions in French, as Lucas states them. Set aside because `docs/`, `AGENTS.md` and the code are in English.
- Keeping the full text of a superseded decision, as [Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) and [Martin Fowler](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html) advise. Set aside because an agent that reads the folder then loads a text that the code does not apply.

## Decision

We record each decision that shapes the code in one file of `docs/decisions/`, named `NNNN-subject.md` and written in English. For the choice of a tool, we write the use we expect of it, whether we hold the choice as firm or on trial, and what would make us revise it.

### Header

The header is a YAML block with the keys of the [MADR 4.0 template](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md):

- `status`: proposed, accepted, rejected, deprecated, or `superseded by NNNN`;
- `date`: the date of the last change of the decision, as YYYY-MM-DD;
- `decision-makers`: the people who decide, Lucas Poulain for this repository;
- `consulted` and `informed`, when there are any.

### Sections

- Context and problem: we state the problem as one question, then the lasting constraints that the answer has to meet, in three sentences at most. A lasting constraint stays true once the decision is applied. We write the survey of the existing code in the issue or the pull request that the decision cites, since it stops being true after the change.
- Considered options: we list the options that were really discussed, each with the reason we set it aside, so that nobody proposes it again without a new element. We leave the section out when one option was discussed.
- Decision: we write the rule we apply.
- Consequences: we write what changes in the system once the decision is applied, the characteristics it improves and those it degrades, then what we have to do when we work on the code.
- Confirmation: we name what checks that the decision is applied, a lint rule, a test or the reviewer, and the mode of the check (error, warning, by hand), so that we see when an accepted decision stops being applied.
- Open questions: we write what remains to decide, and we leave the section out when nothing does.

### Lifecycle

- We propose a decision in a pull request, alone or with the code that applies it, with the status proposed.
- Lucas accepts a decision in the pull request he merges: he sets the status to accepted, or asks for it. A decision stays proposed while a question remains open. Lucas can accept a decision before the pull requests that apply it; we then track them in an issue, which the decision cites.
- A decision that replaces or amends another names it in the first sentence of its Decision section. The pull request that accepts it sets the status of the replaced decision to `superseded by NNNN`, or adds to the amended decision one sentence that links to the amendment.
- We keep the file and the number of a superseded decision. In the pull request that sets its status, we reduce the file to its header and one sentence that links to the new decision; git keeps the earlier text.

### Other places

- `AGENTS.md` links to a decision without stating its rule again. `docs/architecture.md` and the guide of each tool describe how a part works, and link to the decision it applies.
- When Lucas sets the framing of the project with the `contract` skill, the framing gives the characteristics the code keeps and their priorities, and links to the decision of each pattern it applies.
- The documents of the domain that we use when writing the code, such as `docs/access-matrix.md` and `docs/presentation-format.md`, stay in `docs/`.
- A contract of the `contract` skill plans a set of commits; the pull request that applies it adds the decisions the contract fixes to this folder.
- A private note of `docs/private/` holds a study, and we write the decision it leads to in this folder.
- When we move a decision into this folder from a contract, a private note or the memory of the agents, we replace its statement there with one sentence that links to its number, and keep the study or the history.
- We write a rule of the product, such as a label or the behaviour of a page, in the pull request or the issue that sets it.

## Consequences

- An agent finds the decisions from `AGENTS.md`, reads the index of `docs/decisions/README.md`, and opens the decisions that a change touches.
- The text of each decision stays short, and an agent reads one header for a superseded decision.
- We write in this folder, one by one, the decisions that contracts, private notes and the memory of the agents hold, as [issue 235](https://github.com/ShallowRed/vignettes/issues/235) lists them; each of these places stays the source of a decision until we move it.
- Whoever writes a decision writes its header, keeps the index in step, and changes the decision it replaces or amends.

## Confirmation

- `test/unit/decisions.test.ts` checks, in error in the CI, that each decision has a header with a known status, a date and its decision-makers, that a `superseded by` status names an existing decision, and that the index lists every decision.
- The reviewer of a pull request checks by hand that a file records one decision and that its sections follow this decision.

## Open questions

- Do the decisions of interface design, the composition of a screen or the meaning of a visual element, go in this folder, or in a place where they can be seen with the interface?
