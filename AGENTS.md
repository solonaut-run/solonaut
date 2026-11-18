# Rules for coding agents in this repo

This repository is **public**. Everything you commit is published the moment it is pushed and
stays in the history forever, including commit messages, author names and branch names.

## Never commit

- Secrets of any kind: API keys, tokens, passwords, private keys, `.env` files, signing
  certificates.
- Personal data: home paths (`/Users/<name>/…`, `/home/<name>/…`, `C:\Users\<name>\…`), personal
  or company e-mail addresses, machine or host names, IP addresses of real servers, account or
  team ids.
- Anything from another context: an employer's or a client's code, private notes, other private
  repos, the maintainer's own setup. Say "the maintainer", never a name. If in doubt, leave it
  out and ask.
- Real transcripts, session logs or screenshots of real sessions. Fixtures are synthetic.
- Generated output (`dist/`, build artifacts) and `node_modules/`.

`bun run check` runs the safety guard; `bun run setup` installs it as a pre-push hook. Private
words live only in the git-ignored `.safety-guard.local.json` or the `SAFETY_GUARD_WORDS`
variable, never in a tracked file.

## Naming

- The project, the CLI and the toolkit are **solonaut**, always lower case.
- The folders are the names: **core**, **contract**, **plugin**, **app**, **platforms**,
  **sdk**. A platform adapter is named after its platform (`platforms/herdr`).
- Say "for Herdr" or "works with Herdr"; never put "Herdr", "Claude" or another product's name
  in a solonaut product name or logo.
- Names from earlier prototypes are never used here. The safety guard knows the retired ones.

## How to work

- **English** for code, comments, docs, commit messages, issues and branch names.
- **Tests with every change**: `bun run check` green (safety guard, typecheck, tests). Tests use
  temporary homes and data dirs, never the real ones.
- **Pieces talk only through `contract/`.** The plugin, the app, the CLI and the platforms are
  clients of the core service. None of them reads the core's files or imports core code at run
  time. A schema change follows `contract/README.md`: additive is a minor bump, anything a
  client could break on is a major bump and needs an ADR in `docs/adr/`.
- **The model proposes, code enforces.** Any action a model suggests (an answer, an approval, a
  command) is validated by the core before it runs.
- **Gates agents never cross.** Merge or push to a default branch, a release and a deploy are
  always a human's. Agents working here never merge, release or publish either.
- **No telemetry, no network calls** except ones the person configured. Secrets go in the OS
  keychain, never in config files.
- **Data never lives in the install dir.** An update or uninstall replaces that dir.

## Branches and pull requests

- Work issue by issue on a short branch `<issue-number>-<slug>` cut from `main`.
- Keep `bun run check` green locally, then open a pull request to `main` that says `Closes #<n>`.
  CI runs the same checks on Ubuntu, macOS and Windows.
- One issue per pull request. Commits: `area: what changed`, imperative, signed off with
  `git commit -s` using a noreply e-mail. No co-author trailers for tools, no "generated with"
  lines.
- A human maintainer reviews and merges. **Agents never merge, never push to `main`, never
  force-push a shared branch, never release and never change repo settings.**

## Herdr: the person's own setup, never by surprise

- Code that writes into a person's Herdr setup goes through the platform installer only: a plan
  first, add-only tagged blocks, a backup, a confirmation before writing, and a removal that
  gives the files back byte for byte.
- Tests and dev scripts use temporary Herdr homes only. Never run an installer against a real
  home while developing, and never stop, restart or update a running herdr-core you did not
  start yourself.
- Never type into terminals, never use OS-level automation (keystrokes, clicks, moving windows).
  Sessions are reached through the protocol and the platform's own API.
