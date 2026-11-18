# Contributing to solonaut

Thanks for wanting to help. solonaut is early: the most useful contributions right now are
issues that describe a real workflow with many agents, and small, focused pull requests on
issues of the current stage.

## How we work

Everything is planned in [GitHub Issues](https://github.com/solonaut-run/solonaut/issues), grouped
in one milestone per [roadmap](ROADMAP.md) stage. An issue is pull-request-sized and says its
context, scope, acceptance criteria, what is out of scope and what blocks it.

1. **Pick an issue** of the current stage that is not blocked. Issues labelled
   `good first issue` are a good start. Say in a comment that you're taking it.
2. **Short branch** from `main`: `<number>-<short-slug>`, e.g. `12-core-socket`. One issue per
   branch.
3. **Pull request to `main`** with `Closes #12`, once the acceptance criteria pass and
   `bun run check` is green. CI runs the same checks on Ubuntu, macOS and Windows.
4. **Review.** A maintainer reviews and merges. Keep the branch up to date by rebasing; we merge
   with squash or rebase, so `main` stays linear.

Big ideas start as a [Discussion](https://github.com/solonaut-run/solonaut/discussions) or an
issue labelled `type:epic`, and are split into issues when their stage starts.

## Rules

- **English** for code, comments, docs, commits and issues.
- **Tests with every change.** `bun run check` must stay green.
- **The contract is the boundary.** Pieces talk only through `contract/`. A schema change follows
  [contract/README.md](contract/README.md); a breaking change also needs a short decision record
  in [`docs/adr/`](docs/adr/).
- **No telemetry, no surprise network calls.** solonaut only talks to services the person
  configured.
- **Nothing private.** Never commit secrets, tokens, personal paths, personal e-mail addresses,
  real transcripts or code you don't have the right to publish. The safety guard checks this.

## Setup

```sh
bun install          # Bun 1.4+
bun run setup        # installs the pre-push safety guard (.githooks/pre-push)
bun run check        # safety guard + typecheck + tests
```

| Command | What |
|---|---|
| `bun run check` | Everything CI runs |
| `bun run test` | All tests |
| `bun run safety` | Safety guard over the working tree |
| `bun run safety:history` | Safety guard over the working tree and the whole history |
| `bun run setup -- --uninstall` | Removes the pre-push hook |

## Code from the private workshop

solonaut was first prototyped in the maintainer's private workshop repository. Code migrated
from there into this repo is relicensed under the MIT license by its sole author, the
maintainer, and is checked for privacy before it lands.

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) instead of a CLA. Every commit must be signed
off, which certifies that you wrote the change or have the right to submit it under the
project's license:

```sh
git commit -s -m "core: add the local socket"
```

This adds a `Signed-off-by: Your Name <your e-mail>` line. Use an e-mail you are happy to
publish; GitHub's `ID+login@users.noreply.github.com` address works, and the safety guard only
accepts noreply addresses in commit metadata.

## The safety guard

`scripts/safety-guard.ts` blocks secrets, personal home paths, real e-mail addresses, public IP
literals and denylisted words, in files and in commit metadata. Public rules live in
`.safety-guard.json`. Add private words for your own clone in `.safety-guard.local.json`
(git-ignored), as `{"words": [...]}` or sha256 `hashedWords`; they are matched but never
printed. If a line is a false positive, add the marker `safety-guard: allow` to it with a short
reason.

## Commit messages

`area: what changed`, imperative, e.g. `contract: add the session event`. Areas: `core`,
`contract`, `plugin`, `app`, `platforms/<name>`, `sdk`, `docs`, `ci`, `scripts`.
