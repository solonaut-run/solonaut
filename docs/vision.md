# Vision

## The problem

A developer who works with coding agents soon runs many at once: a few sessions in a terminal
app, one in an editor, a worker in a container, a long job on a remote box. Each one stops now
and then to ask for a permission or a decision, each one costs money, and each one lives in its
own window. The developer becomes the slowest part of the system: hunting for the session that
is waiting, re-reading context, answering the same prompt for the fifth time, and never quite
sure what all of them are doing.

## What solonaut is

**solonaut is one control center for all your agents, whatever terminal or machine they run in.**

The value is orchestration. You see every session in one place, everything that waits on you
lands in one inbox, and you answer from there. Later, you hand work to agents in their own
worktrees, with limits, and get results back to review.

solonaut is for one developer and their agents. It is open source (MIT), local-first and
private by default.

## Principles

### Integrate at the agent layer, not the terminal layer

Every terminal (Herdr, Orca, iTerm, tmux, VS Code, a remote SSH box, a container) runs the same
thing: Claude Code. So the **Claude Code plugin is the universal sensor and actuator**: it
reports sessions, relays permission prompts, counts cost, delivers messages and drives workers,
the same way everywhere.

We do not model each terminal's own panes, remotes or agent features. A remote machine is just
another machine running Claude Code plus the plugin. This keeps solonaut working in places we
never wrote an integration for.

### The core is a local service with an event protocol

Instead of a CLI spawned for every hook, the core runs as a small **local service** that owns all
state and speaks an **event protocol**. The CLI, the desktop app, platform mods and, later, a
mobile client are all clients of it.

The same protocol syncs machines. The open-source path is **sync over SSH**: your laptop's core
connects to the core on a remote box with the SSH access you already have, and its sessions show
up next to your local ones.

A **hosted, end-to-end encrypted relay** is a possibility for later: an optional paid service, in
a separate repo with its own license, for people who want to reach their agents from a phone or
without SSH. It is not a promise, and nothing in this repo will ever depend on it.

### Surfaces

- **The desktop app** (Tauri + React) is the control tower: every session, the inbox, costs,
  settings and setup. It has no terminals of its own for now.
- **Claude Code mods inside sessions**, such as an inbox band, bring what waits on you into the
  session you are already looking at.
- **Platform mods and adapters** bring solonaut into the tools you already use.

### Platforms are optional adapters

A platform adapter has a minimal interface:

- **focus this session**;
- **open a visible session here** (a folder and a command).

Where a platform allows it, an adapter may add deeper mods (panels, key bindings, status).
**Herdr is first**, because it is the maintainer's daily driver. Without an adapter, solonaut
falls back to copying the command or opening the default terminal. Nothing requires an adapter.

### Value without configuration

On first run, solonaut reads your existing Claude Code sessions and transcripts, **read-only**,
and shows you what your agents have been doing and what they cost. You get value before you
change a single file.

Everything else is **progressive opt-in, per feature**, and each feature says what it needs:

- approvals in the inbox → install the Claude Code plugin;
- missions and workers → worktrees and Claude Code profiles;
- Herdr → install the Herdr mods.

### Install: one plan, everything undoable

The ideal install: download the signed app, open it, press **Set up**. It shows **one reviewable
plan** of every change it will make (files, plugins, mods), applies it with your confirmation,
and keeps a journal so **everything can be undone**.

Headless, for servers and for agents:

```sh
curl -fsSL solonaut.run/install | sh
solonaut setup            # shows the plan, asks before applying
solonaut setup --yes      # applies it without asking (scripts, CI, a Claude agent)
```

`solonaut setup` is designed so a Claude agent can run it for you, and the plan reads the same
in the app, in the terminal and as JSON.

## Safety

- **Gates agents never cross.** Merging or pushing to a default branch, a release and a deploy
  are always a human's decision. The gate guard refuses them for agent sessions whatever their
  permissions say.
- **The model proposes, code enforces.** A model may suggest an answer, an approval or a
  command; the core validates it against the current state and the policy before anything
  happens. A claim without a result is never reported as done.
- **No telemetry.** solonaut never phones home.
- **Network only when you configure it.** The core listens on a user-only local socket; sync uses
  your SSH; any outside service is opt-in, per service.
- **Secrets in the OS keychain**, never in config files or logs.
- **Nothing typed into terminals.** Answers travel as messages through Claude Code, never as
  simulated keystrokes.

## Scope

- **Claude Code first.** Other agents come later through **agent adapters** in the same layer as
  the plugin, speaking the same protocol.
- **macOS, Linux and Windows** for the core, the plugin and the app.
- **One monorepo** for everything the project owns: `core/`, `contract/`, `plugin/`, `app/`,
  `platforms/herdr/` (later others) and `sdk/`. Platforms talk to the core only through
  `contract/`. Third-party adapters live in their own repos, built on `sdk/`.

## What solonaut is not

- Not a terminal and not an editor. It works with the ones you already use.
- Not an agent. It runs next to Claude Code and never replaces its judgement or yours.
- Not a cloud service. Everything runs on your machines unless you choose otherwise.
- Not a team product, for now. It is built for one developer with many agents.

## How the project grows

solonaut was first built bottom-up in a private workshop, where ideas were tried quickly. This
repository starts again top-down, with the structure above. Pieces move here one at a time, and
only once they are polished, tested and checked for privacy. The [roadmap](../ROADMAP.md) lists
the order.
