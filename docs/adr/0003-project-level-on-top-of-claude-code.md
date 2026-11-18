# 0003: The project level on top of Claude Code

**Status:** Accepted

## Context

Claude Code already has a good **repo level**. A session started anywhere inside a repo reads
the `CLAUDE.md` files up to the repo root, the repo's `AGENTS.md` when its `CLAUDE.md` imports
it, and the skills in the repo's `.claude/skills`. A repo that writes these files well works
for anyone who opens it with plain Claude Code.

Real work is often bigger than one repo. A project can span several repos (an app, its API, a
shared library, the docs), with one orchestrator session that plans, many worker sessions that
build, and live state that has to survive between sessions: what is in flight, what was
decided and why, what the next session should pick up. Claude Code has no **project level**:
nothing in it knows that two repos belong together, which session is the orchestrator, or what
was decided yesterday in another session.

The obvious workaround is to build that project level out of repo-level pieces: a `CLAUDE.md`
in a parent folder that holds several repos, skills scoped to that folder, handoff files that
a session is supposed to read when it starts. This was tried repeatedly, before this repo, and
it kept failing in the same ways:

- Those pieces are **bound to the folder by design**. A session started in a worktree, in a
  sibling checkout, in a temporary directory or on another machine does not see the parent
  folder's `CLAUDE.md` or skills. The project context silently disappears.
- The **role** of a session (orchestrator or worker) was guessed from where it started. A worker
  started in the project folder behaved like an orchestrator; an orchestrator started inside one
  repo lost the project view.
- **Handoff files nobody loads** went stale. Nothing guaranteed that the next session read them,
  so state lived in files that were sometimes current and sometimes not.
- Project rules written into repo files **leaked into the repo** and confused people and tools
  that use the repo without that project around it.

solonaut needs a project level for missions, workers and the orchestrator. This record fixes
where it lives and how it reaches a session, so later stages build on one structure.

## Decision

Four principles, optional organisation levels, and three rules.

### Organisation levels are optional and progressive

solonaut does not force a way of organising work. Each level is **opt-in**, and each one **adds
without changing how the lower ones behave**:

- **Level 0, sessions only.** With no setup at all, the person sees their sessions, the inbox
  and the permission relay. There is no project concept.
- **Level 1, one repo.** The default when a project is needed. An **implicit project equals the
  repo**, keyed by the repo identity solonaut already derives from the git remote (or the common
  git dir when there is no remote), so clones and worktrees of one repo share it. State,
  decisions and the orchestrator role work here **without registering anything**.
- **Level 2, a project spanning several repos or folders.** The person opts in by registering
  the project and its folders.
- **Level 3, grouping projects**, for example by organisation. Display and grouping only; it is
  never required and changes nothing about how a project resolves or behaves.

Someone with one project in one repo never sees organisations or multi-repo concepts.

### 1. Nothing important depends on the folder

solonaut **resolves the project from any working directory**: it walks up from the session's
folder to the nearest folder registered for a project (level 2); when there is none, the
session's repo is its project (level 1); outside any repo and any registered folder there is no
project (level 0). Worktrees, clones in other places and temporary checkouts resolve the same
way, through the repo identity the core already keeps.

A session's **role** (orchestrator, worker of mission X, or a plain session) is **declared at
launch**: by a solonaut launch command the person runs, or by solonaut itself when it starts a
worker. It is never inferred from the folder.

The folder only says **which code the session is editing**.

### 2. Two levels, each with its owner

- **The repo level belongs to Claude Code and the repo's own files**: `CLAUDE.md`, `AGENTS.md`,
  `.claude/skills`. solonaut does not write into them to carry project context.
- **The project level belongs to solonaut**: which repos form a project, the orchestrator, the
  live state, the decisions, the handoffs between sessions.

The project level is **never built from repo-level pieces**: no `CLAUDE.md` files in parent or
organisation folders, no folder-scoped skills standing in for project skills, no handoff files
that nothing loads. Those pieces are folder-bound by design, which is exactly what the project
level must not be.

### 3. solonaut adds, never replaces; vanilla Claude Code is the floor

- A repo stays **self-sufficient** for anyone without solonaut.
- solonaut only **adds** context on top: the project's state, its decisions, the session's role.
  What it adds is **labelled as solonaut's**, so the model and the person can tell it apart from
  the repo's own instructions.
- It **never contradicts the repo**. If they conflict, **the repo wins**.
- Its data is **plain Markdown** that a person, or a Claude session without the plugin, can read
  or `@import` by hand.
- **Fail open.** If the core is down or slow, the session starts as plain Claude Code, as the
  plugin already does for permissions.

### 4. Skills live where their scope is

- **Repo skills** live in the repo's `.claude/skills` and are used by the workers that start in
  that repo. The orchestrator works at project level and delegates repo work to those workers.
- **Project skills** that cross repos live in a **per-project skill pack**: a small Claude Code
  plugin that solonaut stores in its data dir and loads into that project's sessions at launch
  with the documented per-session flag `--plugin-dir <path>` ("Load a plugin from a directory or
  `.zip` archive, or several from a folder of plugins, for this session only", [CLI
  reference](https://code.claude.com/docs/en/cli-reference); verified in the CLI help of Claude
  Code 2.1.326; a folder of plugins needs 2.1.265 or later). A session started without a
  solonaut launch command does not get the pack. The person can still load it by hand with the
  same flag, or install it user-wide; solonaut never installs it user-wide by surprise.
- **Personal skills** live in the person's own plugin marketplace, installed user-wide.

### Rule: only documented extension points

The core and the plugin use only what Claude Code documents for extension: **plugins**, **hooks**
(such as `SessionStart` with `additionalContext`), **MCP**, **`CLAUDE.md` imports**, **settings
and CLI flags** (such as `--plugin-dir`), and the **`claude plugin` commands**.

Anything that reads **undocumented internals** (transcripts, session files under the Claude
Code config dir) is **isolated in the Claude agent adapter**. When a format changes, the adapter
switches off only the feature that depends on it and says so in a notice; it never breaks a
session or the core. A **scheduled CI job** runs the adapter's tests against the latest Claude
Code release, so a format change is found by CI before a person finds it.

### Rule: private project data never reaches a repo

A project's rules, state and decisions are private to the person, and many repos are public.

- They live **only in solonaut's data dir**, never inside any repo folder, worktree or
  registered project folder.
- The context injected at session start is wrapped in a **clearly labelled block**: private
  project context, for this session only, never to be copied into commits, pull requests,
  issues or comments.
- A repo's own safety checks (such as this repo's safety guard) remain the **backstop**: the
  label lowers the risk, the guard catches what slips through.

### Rule: change by evidence

The structure is **used for real work before it is changed**. Friction is logged as it
happens, each entry with a concrete example (what was tried, in which folder, what went wrong).
A change to this structure goes through **a new ADR that supersedes this one**.

## Consequences

- The **core gains project records**: implicit repo projects (level 1), registered projects with
  their folders (level 2), optional groups (level 3), and a context store with rules, state and
  decisions as Markdown under solonaut's data dir. Repo identity (worktrees and clones resolving
  to one repo) is a prerequisite, and it is what makes level 1 work with no setup.
- **Every level is tested on its own.** Level 0 behaves the same with or without a project
  store; level 1 needs no registration; level 3 changes only grouping and display.
- **Private by placement and by label.** The store refuses paths inside any repo or registered
  folder, the injected block carries the "private, this session only, never copy into commits,
  pull requests, issues or comments" label, and the safety guard stays the backstop. A model can
  still quote what it was given, so the label and the guard are both needed.
- The **plugin's `SessionStart` hook** injects the project context and the session's role as
  `additionalContext`, labelled as solonaut's. It has a short timeout and injects nothing when
  the core does not answer.
- **Launching gains a role.** A solonaut launch command starts the orchestrator; solonaut starts
  workers with their mission. Both pass the role and the project's skill pack to Claude Code at
  launch. A session started with plain `claude` is a plain session with the project context
  only.
- **The orchestrator updates the project** through solonaut commands (state, decisions), so the
  next session reads a current, single source instead of a handoff file.
- **Transcript reading moves behind the adapter.** Read-only discovery of existing sessions and
  usage estimates (both read transcripts) go through the Claude agent adapter and degrade with a
  notice when the format changes.
- **Some convenience is given up.** A session started outside solonaut gets no role and no
  project skills unless the person adds them by hand. That is the price of keeping vanilla
  Claude Code as the floor.
- **Project context costs tokens** in every session of the project. The store keeps it short:
  rules and current state are injected, older decisions are linked, not inlined.

## Alternatives considered

- **Project `CLAUDE.md` files in parent or organisation folders.** Rejected: folder-bound, so
  invisible from worktrees, other checkouts and other machines; tried and failed.
- **Folder-scoped skills for project work.** Rejected for the same reason, and because they
  change with the folder a session happens to start in, not with the project.
- **Handoff files in the repo or the project folder.** Rejected: nothing guarantees a session
  loads them, they go stale, and they put project state into repo history.
- **Requiring every project to be registered**, or organising projects by organisation from
  the start. Rejected: it forces one way of working on everyone; the simplest case (one repo)
  must work with no setup.
- **Keeping project state in a git-ignored file inside the repo.** Rejected: one mistaken
  `git add -f` or a copied folder publishes it, and it is still folder-bound.
- **Inferring the role from the folder** (the project folder means orchestrator, a repo means
  worker). Rejected: the folder says what code is edited, not what the session is for.
- **Writing project context into the repo's `CLAUDE.md`** (a tagged block). Rejected: it leaks
  project rules into a repo other people use without solonaut, and it is still folder-bound.
- **Reading Claude Code internals from the core** for session state. Rejected for the core: it
  breaks silently on any format change. Allowed only inside the adapter, behind tests that run
  against the latest release.
- **A system prompt flag for project context** (`--append-system-prompt`). Not chosen as the
  main path: it only works for sessions solonaut launches, while `SessionStart` context also
  reaches sessions started with plain `claude` in a registered project, and a resumed session
  gets the current state instead of the state at launch.
