# The project workflow

How solonaut expects you to organise work with Claude Code, from one repo to a project that
spans several. The decision behind it is
[ADR 0003](../adr/0003-project-level-on-top-of-claude-code.md); this guide is the practical side.

> **Status.** solonaut is pre-release. The pieces marked **coming** are the stage 2 workflow
> kernel and link to their issues. For each one this guide gives a **manual equivalent** that
> uses plain Markdown files in the same layout the kernel will read, so nothing you set up by
> hand has to be redone later.

## Pick the smallest level that works

Organisation in solonaut is optional and progressive. Each level adds to the one below and never
changes how it behaves. Most people need level 1.

| Level | What you get | What you set up |
|---|---|---|
| 0, sessions only | Every session, the inbox, the permission relay | Nothing |
| 1, one repo | A project per repo: rules, state, decisions, an orchestrator | Nothing; the repo is the project |
| 2, several repos | One project across several repos or folders | Register the project and its folders |
| 3, groups | Projects grouped, for example by organisation | Optional, display only |

If you work in one repo, stop reading at the end of [One repo](#one-repo-level-1). The
multi-repo part only matters when one piece of work really crosses repos.

## One repo (level 1)

### The repo stays self-sufficient

Your repo's own `CLAUDE.md` and `AGENTS.md` (and `.claude/skills`) describe how to work **in the
code**: how to build, test, name things, what never to commit. They must work for anyone who
opens the repo with plain Claude Code and no solonaut. That is the floor, and solonaut never
replaces it: if solonaut's context and the repo disagree, **the repo wins**.

Nothing about the project's progress goes into the repo: no state files, no decision logs, no
handoff notes.

### The project is the repo

With no setup, the repo is its own project. solonaut keys it by the repo identity it derives
from the git remote, so every clone and every worktree of the repo share the same project,
wherever they are on disk.

### Where the project's knowledge lives

Each project has three plain Markdown files in **solonaut's data dir**, never inside a repo:

```
<data dir>/projects/<project>/
  rules.md        standing rules for this project's sessions (how we work, not how the code works)
  state.md        what is in flight now, what is next, what is blocked
  decisions.md    append-only: what was decided, why, and by whom
  pack/           optional: this project's own skills (see "Where skills go")
```

`<data dir>` is `$SOLONAUT_DATA_DIR` if set; otherwise `$XDG_DATA_HOME/solonaut`
(`~/.local/share/solonaut` by default) on Linux and macOS, and the local app data folder on
Windows ([#7](https://github.com/solonaut-run/solonaut/issues/7)). For a level 1 project,
`<project>` is the repo's name; any short, stable name works for a manual setup, and the kernel
adopts an existing folder as-is.

These files are **private**. Many repos are public, so this data never lives in one, and what a
session receives is labelled "private, for this session only, never copy into commits, pull
requests, issues or comments". Your repo's own safety checks remain the backstop.

A decision entry looks like this:

```md
## 2026-01-15: Keep the importer synchronous for now

Why: the queue adds a moving part before we know the volumes; revisit at 10k rows per import.
Decided by: the person, in the orchestrator session.
```

**Coming:** the context store ([#35](https://github.com/solonaut-run/solonaut/issues/35)) and
project resolution ([#34](https://github.com/solonaut-run/solonaut/issues/34)). **Today:**
create the folder and the three files by hand.

### Session roles

A session's role is declared **when it is launched**, never guessed from the folder it starts
in. The folder only says which code it edits.

- **Orchestrator.** One per project. It reads the project's state, plans, delegates code work to
  workers, records decisions and updates the state. It works at the project level and does
  little coding itself.
- **Worker.** Does one piece of work in one repo (usually in its own worktree), with the repo's
  own `CLAUDE.md` and skills. It reports back; it never writes the project's state or decisions.
- **Plain session.** Anything else: a quick question, a one-off fix. It is plain Claude Code
  plus, once the kernel lands, the project's context labelled as read-only background.

How each is launched:

| Role | Coming | Today, by hand |
|---|---|---|
| Orchestrator | `solonaut orchestrate` ([#37](https://github.com/solonaut-run/solonaut/issues/37)) | The launcher below |
| Worker | Started by solonaut for a mission ([#37](https://github.com/solonaut-run/solonaut/issues/37), missions in stage 5) | A subagent the orchestrator starts, or `claude` in the repo's worktree with a written brief |
| Plain | `claude`, as always | `claude`, as always |

The manual orchestrator launcher on Linux and macOS (save it as a shell function or script; on
Windows use the same flags from PowerShell):

```sh
P="${SOLONAUT_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/solonaut}/projects/my-app"
PACK=(); [ -d "$P/pack" ] && PACK=(--plugin-dir "$P/pack")
claude --add-dir "$P" "${PACK[@]}" --append-system-prompt "You are the orchestrator of the \
project my-app. Before anything else, read $P/rules.md, $P/state.md and $P/decisions.md. This \
is private project context for this session only: never copy it into commits, pull requests, \
issues or comments. The repo's own CLAUDE.md and AGENTS.md win on any conflict. Delegate code \
work to workers. At the end of each block of work, update $P/state.md and append your \
decisions to $P/decisions.md."
```

All of these are documented Claude Code flags (`--add-dir`, `--plugin-dir`,
`--append-system-prompt`; see the [CLI reference](https://code.claude.com/docs/en/cli-reference)).
Once the kernel lands, the context arrives through the plugin's `SessionStart` hook instead
([#36](https://github.com/solonaut-run/solonaut/issues/36)), also on resume, and the launcher
becomes one command.

### Who updates what, and when

| File | Who writes it | When |
|---|---|---|
| `rules.md` | The person (the orchestrator may propose) | Rarely, when a way of working changes |
| `state.md` | The orchestrator | At the end of **each block of work**, and before the session ends |
| `decisions.md` | The orchestrator, or the person | When a decision is made, one entry each, never rewritten |

Workers report to the orchestrator; they do not touch these files.

**Coming:** `solonaut project state set` and `solonaut project decide`, plus matching MCP tools,
which refuse writes from workers
([#38](https://github.com/solonaut-run/solonaut/issues/38)). **Today:** the orchestrator edits
the files directly, as the launcher tells it to.

### Where skills go

Put a skill where its scope is:

| Kind | Where | Who uses it |
|---|---|---|
| Repo skill (how to work in this code) | The repo's `.claude/skills` | Workers and anyone in the repo |
| Project skill (crosses repos, or about the project's process) | The project's pack: `<data dir>/projects/<project>/pack/` | The project's sessions, loaded at launch |
| Personal skill (how *you* like to work, everywhere) | Your own plugin marketplace, installed user-wide | All your sessions |

A pack is a small Claude Code plugin: `pack/.claude-plugin/plugin.json` and
`pack/skills/<skill>/SKILL.md`. It is loaded per session with the documented `--plugin-dir` flag.
**Coming:** packs created and loaded by solonaut
([#39](https://github.com/solonaut-run/solonaut/issues/39)). **Today:** create it by hand; the
launcher above already loads it.

### A day of work

1. **Start the orchestrator** for the project.
2. **It reads the state**: rules, current state, recent decisions. Ask it where things stand.
3. **Plan the block of work** together. The orchestrator splits it into tasks.
4. **It delegates** each code task to a worker in the right repo, with a short brief. Workers
   build, test and report back; gates (merging, releasing, deploying) stay yours.
5. **Decisions are recorded as they happen**, one entry each in `decisions.md`.
6. **At the end of the block, the orchestrator updates `state.md`**: done, in flight, next,
   blocked.
7. **End the session.** Tomorrow's orchestrator starts from the state, not from memory or a
   handoff file.

## Several repos (level 2)

When one piece of work really spans repos (an app and its API, a library and its consumers),
make it one project:

- **Register the project and its folders.** solonaut then resolves the project from any of
  them, from their worktrees and from other clones. **Coming:** `solonaut project add`
  ([#34](https://github.com/solonaut-run/solonaut/issues/34)). **Today:** create the project
  folder in the data dir and list the repos at the top of `rules.md`.
- **Start the orchestrator in a neutral place** (the project's main repo or any folder of it);
  it delegates each repo's work to workers that start in that repo, so each worker gets that
  repo's own `CLAUDE.md` and skills.
- **Cross-repo skills go in the project's pack**, never in a `CLAUDE.md` or `.claude/skills` in
  a parent folder. Parent-folder files are bound to that folder: a worktree or another clone
  never sees them.

Everything else (rules, state, decisions, roles, the day) works exactly as at level 1.

## Grouping projects (level 3)

You can group projects, for example by organisation, to sort and filter them in solonaut's
views. Groups are display only: they never change how a project resolves or what its sessions
receive. Skip this until you have enough projects to want it.

## The friction log

The structure changes by evidence, not by taste. While you work, keep a short private log of
friction, each entry with a concrete example: what you tried, in which folder or role, what
went wrong, what you expected.

Keep it in `<data dir>/projects/<project>/friction.md` (the kernel does not inject it). When an
entry is about solonaut itself rather than your project, describe it in generic terms in the
project's Discussions. Changes to the structure go through a new ADR that supersedes
[ADR 0003](../adr/0003-project-level-on-top-of-claude-code.md).

## Without solonaut

Everything above degrades to plain Claude Code. If solonaut is not installed or not running,
sessions start as they always do, with the repo's own files. The project's files are still
plain Markdown you can read or pass to a session by hand.

Bringing an existing project in? Follow [Adopting a project](adopting-a-project.md).
