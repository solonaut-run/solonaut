# Architecture

How the pieces of solonaut fit together. Read the [vision](vision.md) first for the why.

> Status: this is the target design. Parts of it are decisions, parts are proposals that the
> first stages will test. Anything that turns out wrong is changed through an ADR in
> [`adr/`](adr/).

## The picture

```
                         ┌──────────────────────── clients ────────────────────────┐
                         │                                                         │
                         │  desktop app       solonaut CLI     platform mods       │
                         │  control tower,    setup, status    Herdr first         │
                         │  Houston,                           mobile (later)      │
                         │  Ground Control                                         │
                         └──────────────────────────┬──────────────────────────────┘
                                                    │  protocol (contract/)
                                                    │  requests · responses · events
                                                    ▼
   machine A (your laptop)              ┌───────────────────────────┐
                                        │ core service              │
   ┌──────────────────────────┐ events  │  event log → state        │   SSH (stdio)   ┌───────────────────┐
   │ Claude Code + plugin     │────────▶│  sessions · repos · inbox │◀───────────────▶│ core service      │
   │ in any terminal:         │◀────────│  messages · costs · gates │   same protocol │ machine B (remote │
   │ Herdr, iTerm, tmux,      │ answers │  sync endpoint            │                 │ box, container)   │
   │ VS Code, …               │         └─────────────┬─────────────┘                 └─────────▲─────────┘
   └──────────────────────────┘                       │                                         │
                                                      ▼                                Claude Code + plugin
                                           data dirs (config, data, state)
                                           secrets → OS keychain

   platform adapters (optional): focus(session) · open(folder, command) · deeper mods where possible
```

## The pieces

| Piece | Folder | What it is |
|---|---|---|
| **core** | `core/` | A local service, one per user and machine, that owns all state. Also ships the `solonaut` CLI. |
| **contract** | `contract/` | The protocol: schemas for every request, response and event. The only thing the pieces share. |
| **plugin** | `plugin/` | The Claude Code plugin: hooks and MCP tools. The sensor and actuator in every session. |
| **app** | `app/` | The desktop app (Tauri + React): the control tower and the setup flow. |
| **platforms** | `platforms/<name>/` | Optional adapters and mods for terminal apps. Herdr first. |
| **sdk** | `sdk/` | Client libraries and adapter interfaces, for this repo and for third-party adapters. |

## Surfaces and names

The views are clients of the core and are named for what they show: **Inbox**, **Sessions**,
**Missions**, **Memory**, **Automations**, **Changes**, **Files**, **GitHub**. Two have proper
names:

- **Houston**: the status chip (how much waits on you, and how urgent), the toasts, the
  notification policy, and later the voice. Houston only reads state and sends the same requests
  as any other client; when it speaks, it says what a tool result says, never more.
- **Ground Control**: a dashboard the person builds from widgets. Each view declares the widgets
  it can draw (name, sizes, scope); Ground Control arranges them and never draws another view's
  data itself. The same widget can appear in the app and, where a platform allows, in a platform
  mod.

**Platforms, the app, the CLI and the plugin talk to the core only through `contract/`.** None
of them reads the core's files or imports its code at run time. That is what lets each piece ship
on its own schedule and lets third parties write adapters without forking.

## The core is a service

The core runs as a small local service (`solonaut serve`) instead of a CLI spawned per hook.

Why:

- **Push, not polling.** Clients subscribe to events and redraw when something changes. A UI does
  not poll files every second.
- **Latency in hooks.** A permission prompt is on the critical path of a session. Sending one
  message to a running service is cheaper than starting a process that loads config and takes a
  lock.
- **Sync needs a stream.** Replicating machines is replaying events; a service that already has an
  event log gets that almost for free.
- **One writer.** Every record has one owner, the core, so many concurrent sessions never corrupt
  each other's data.

The cost is lifecycle: something must start the service, keep one instance, upgrade it and
survive crashes. The plan:

- **Lazy start.** Any client (the CLI, the app, the plugin's hook client) that finds no service
  starts one. Starting at login is opt-in.
- **Single instance** through a lock in the state dir; a second `serve` exits cleanly.
- **Upgrades** hand over: the new binary asks the old service to drain and stop, then takes the
  socket.
- **Fail open, safely.** If the core is not running or does not answer in time, the plugin does
  nothing and Claude Code behaves exactly as it would without solonaut: its own permission prompt
  in its own terminal. solonaut never makes a session depend on it.

### Transport

- **Locally**: a Unix domain socket in the state dir with user-only permissions (`0600` in a
  `0700` dir) on macOS and Linux; a named pipe with a user-only ACL on Windows. No TCP port, so
  nothing on the network can reach it.
- **Between machines**: the same protocol over the stdio of `ssh <host> solonaut bridge`, using the
  person's own SSH keys and config. solonaut never opens a port and never stores SSH credentials.

## The protocol

Defined in [`contract/`](../contract/) as JSON Schemas. Messages are newline-delimited JSON.

- **Handshake.** The client says who it is (`kind`: cli, app, plugin, platform, peer) and which
  contract versions it speaks; the core answers with the version chosen, its capabilities and the
  machine id. A client shows an empty state for a missing capability instead of breaking.
- **Requests and responses**, with an id, for reads (`sessions.list`) and actions
  (`inbox.answer`). Every action that changes a record carries the record's `rev`, and a stale
  `rev` is refused: an answer to a card that changed while you looked never goes through.
- **Events**, an append-only stream with a sequence number per machine (`session.started`,
  `item.opened`, `item.answered`, `message.delivered`, `cost.sampled`, …). A client subscribes
  from a sequence number and gets what it missed, then live events. Reconnecting is resuming.
- **Unknown fields, events and capabilities are ignored**, never an error.

Versioning: `MAJOR.MINOR`, separate from any binary. Additive changes bump the minor; anything a
client could break on bumps the major and needs an ADR.

## State and data

The core keeps an **event log** and builds its **state** (the current view of sessions, items,
messages, costs) from it, with snapshots so a restart does not replay everything.

Main records:

- **machine**: a stable id per core; every other record carries the machine it comes from.
- **session**: one Claude Code session (its id is Claude Code's own), with its repo, branch,
  working folder, config dir and the terminal hints the plugin can see.
- **repo**: worktrees of one checkout and clones of one remote resolve to the same repo id, so
  cost and inbox group them together.
- **item**: something that waits on the person (a permission, a decision, a finding, a task, a
  draft), with a `rev` and a state.
- **message**: an answer or note travelling to a session, with its delivery state (pending,
  delivered, confirmed).
- **usage**: token counts read from transcripts, turned into a cost estimate.

Data dirs follow each OS's conventions (XDG on Linux and, by choice, on macOS; the known folders
on Windows) and can be overridden with environment variables. **Data never lives in the install
dir.** Secrets (API keys for optional services) go in the **OS keychain**.

## The plugin: sensor and actuator

The Claude Code plugin is the same in every terminal and on every machine:

- **Hooks** report session events (start, prompt, tool use, stop, end) to the core through a tiny
  hook client with a short timeout.
- **Permission relay.** A permission request becomes an inbox item classified by the safety rules.
  The hook waits for an answer while Claude Code's own prompt stays available; whichever is
  answered first wins. Dangerous actions need a second confirmation. Gates are never relayed as
  something to allow.
- **Gate guard.** A pre-tool-use check refuses merge or push to a default branch, releases and
  deploys for agent sessions, whatever their permission mode.
- **MCP tools** let an agent ask a decision with its recommendation, report a finding, or update
  its session summary, instead of asking in the chat.
- **Delivery.** Answers reach the session as messages through Claude Code itself, never as typed
  keystrokes: live when the session accepts inbound messages, otherwise on its next prompt.

The plugin reports and asks; **the core decides**.

## Projects: the level above the repo

Decided in [ADR 0003](adr/0003-project-level-on-top-of-claude-code.md). The repo level (a
repo's `CLAUDE.md`, `AGENTS.md`, `.claude/skills`) belongs to Claude Code and the repo; the
project level belongs to solonaut and is never built from repo-level files.

- **Project resolution.** The core resolves a session's project by walking up from its working
  directory to a folder registered for a project, using the repo identity, so worktrees and
  other checkouts resolve the same way.
- **Context store.** Each project has rules, state and decisions as plain Markdown under
  solonaut's data dir, readable and `@import`-able without solonaut.
- **Injection.** The plugin's `SessionStart` hook adds the project context and the session's
  role as `additionalContext`, labelled as solonaut's. It fails open: no answer in time, no
  context, a plain session. The repo wins on conflict.
- **Roles at launch.** The orchestrator is started with a solonaut launch command; workers are
  started by solonaut with their mission. The role is never inferred from the folder.
- **Skill packs.** A project's cross-repo skills are a small plugin in solonaut's data dir,
  loaded per session with Claude Code's documented `--plugin-dir` flag.
- **Documented extension points only.** Anything that reads Claude Code internals (transcripts,
  session files) lives in the Claude agent adapter, degrades with a notice when a format
  changes, and is tested on a schedule against the latest Claude Code release.

## First run: value without configuration

Before anything is installed, the core can read the existing Claude Code config dirs and their
session transcripts **read-only**: which sessions ran, in which repos, what they did and roughly
what they cost. The app shows this on first launch. Nothing is written into Claude Code's files
for this.

Features are then turned on one at a time, each with its own plan: approvals need the plugin,
missions need worktrees and profiles, Herdr needs its mods.

## Setup: a plan, then a journal

Setup is one engine with three faces (the app's **Set up** button, `solonaut setup`, and JSON
for agents):

1. **Plan.** The core computes every change: files it would write, plugins and mods it would
   install, settings it would add. Each step says what, where and why. Nothing has been touched.
2. **Apply.** After confirmation (or `--yes`), each step runs with a backup first and is recorded
   in a **journal**.
3. **Undo.** Any applied step, or the whole setup, can be undone from the journal, giving files
   back byte for byte.

Writes into another tool's files are add-only and tagged, so solonaut never edits what it did
not write.

## Platform adapters

A platform adapter is a client of the core with a minimal interface:

```ts
interface PlatformAdapter {
  id: string;                       // "herdr"
  capabilities: string[];           // e.g. ["focus", "open", "mods"]
  focus(session: SessionRef): Promise<Result>;
  open(request: { folder: string; command: string[]; title?: string }): Promise<Result>;
}
```

- The core knows which platform a session runs in from the hints the plugin reports (environment
  variables the terminal sets), and asks that platform's adapter to focus it.
- Without an adapter, `open` falls back to copying the command or opening the default terminal,
  and `focus` to showing where the session runs.
- Deeper mods (panels, key bindings, status) are optional and per platform.
- Adapters in this repo live in `platforms/<name>/`; others live in their own repos, built on
  `sdk/`.

## Agent adapters

Claude Code comes first, through the plugin. Other agents come later through **agent adapters**
in the same layer: anything that can report sessions and permission requests in the protocol's
terms and deliver messages back. The core does not change for a new agent.

## Multi-machine sync

Each core is the **only writer for its own sessions**. Sync replicates, it does not merge:

- Your laptop's core connects to a remote core over SSH and subscribes to its events. The remote
  sessions appear in your app with their machine.
- An action on a remote item (an answer, an approval) is sent to the core that owns it, which
  validates it against its own state and `rev`, exactly as a local action.
- Because there is one writer per record, there are no merge conflicts to resolve. A machine that
  is offline simply shows as offline, with its last known state.

A **hosted, end-to-end encrypted relay** could later carry the same protocol for people who
cannot or do not want to use SSH, or want to reach their agents from a phone. If it ever exists,
it lives in a separate repo with its own license, is optional and paid, and the relay sees only
encrypted bytes. Nothing in this repo will depend on it.

## Safety in code

- **Gates** (merge or push to a default branch, release, deploy) are refused for agent sessions by
  the gate guard, and are never offered as something an inbox, Houston's voice or a model can
  allow.
- **The model proposes, code enforces.** Every action from a model or a client is a request the
  core validates against the current `rev` and the policy. Retries are idempotent by request id.
- **Only the local user and SSH-authenticated peers** reach the core.
- **No telemetry. No network** except the services the person configured.
- **Secrets in the OS keychain**, never in config files, logs or events.

## Repo rules that follow from this

- One monorepo for everything the project owns.
- `contract/` changes follow its README; breaking ones need an ADR.
- Tests run against temporary data dirs and fake sessions, never against a real home.
- CI runs on Ubuntu, macOS and Windows.
