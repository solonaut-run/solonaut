# Roadmap

Stages in the order that delivers the most value first. There are no dates: a stage is done
when its "done when" conditions are true. Each stage is a GitHub milestone, and its issues are
written when the stage before it is nearly done.

Many of these pieces were first tried in a private workshop. They move here one at a time, only
once they are polished, tested and checked for privacy. The "from the workshop" lines say what
already exists in some form.

## 1. Foundations

The skeleton, the contract and the core service, so every later piece has something to talk to.

- Repo skeleton, CI on three OSes, the safety guard.
- The protocol in `contract/`: handshake, requests, responses, events, versioning rules.
- The core service: local socket, single instance, lazy start, event log, state and snapshots,
  data dirs.
- The CLI and the TypeScript client in `sdk/` as the first clients.
- Read-only discovery of existing Claude Code sessions and transcripts.

**Done when:** on macOS, Linux and Windows, `solonaut status` starts the service if needed,
completes the handshake and lists the sessions found in existing transcripts, read-only; a
client that subscribes, disconnects and reconnects gets every event it missed; CI is green on
all three OSes.

## 2. Plugin

The Claude Code plugin as the sensor and actuator in every session.

- Session events from hooks, with repo, branch, machine and terminal hints.
- The permission relay, with Claude Code's own prompt as the fallback, and the gate guard.
- MCP tools for agents: ask a decision, report a finding, update the session summary.
- Inbox data in the core: items with `rev`, answers as messages with delivery states.
- Usage and cost estimates from transcripts.

From the workshop: the session registry, the inbox and its item kinds, the permission relay,
the gate guard, message delivery and the session summary.

**Done when:** with the plugin installed, every new session in any terminal appears in
`solonaut sessions`; a permission prompt can be answered from `solonaut inbox answer` or in the
terminal, whichever comes first; a gate is refused for an agent session; with the core stopped,
sessions behave exactly as without solonaut.

## 3. Herdr platform

The first platform adapter and its mods, polished enough to replace the maintainer's previous
setup day to day.

- The adapter: focus a session's pane, open a visible session in a folder.
- Mods: the inbox and the sessions list, as clients of the core.
- The installer: a plan, add-only tagged blocks, a backup, a confirmation, a byte-for-byte
  removal.

From the workshop: the inbox, sessions and notification mods and the Herdr installer.

**Done when:** the maintainer runs a full working week on the Herdr mods alone, without
falling back to the previous setup; installing and removing them leaves a Herdr home byte for
byte as it was.

## 4. App: control tower, setup and first release

The desktop app as the place to see and steer everything, and the first public release.

- The app (Tauri + React): sessions on every machine, the inbox, costs, settings. No terminals
  of its own.
- First-run value: what your agents did and cost, read-only, before any setup.
- The setup flow: one reviewable plan, applied with one press, a journal, undo. `solonaut setup
  [--yes]` for headless use and for agents.
- Signed and notarized builds, the install script, updates.
- **First release, 0.1.**

From the workshop: the app scaffold and its settings center, packaging for three OSes, the
install script, and the views that let solonaut run without Herdr.

**Done when:** on a clean machine, a person downloads the signed app, presses **Set up**,
reviews the plan, applies it and answers their first permission prompt from the app; undoing
the setup leaves no trace; the same works headless with the install script and
`solonaut setup --yes`; 0.1 is published.

## 5. Missions and workers, review, memory, voice

Handing work to agents, and getting it back in a shape you can trust.

- Missions and workers: work handed to agents in their own worktrees and profiles, with limits
  in tokens and quota, results sent back.
- Review: what a worker changed, ready to read, with the gates kept for you.
- Memory: what agents learned about a repo, proposed by agents and approved by you.
- Voice: hear what needs you and answer by voice, with dangerous actions never approved by
  voice.

From the workshop: tasks and missions, automations, per-repo memory and checkpoints, Claude
Code profiles, and the voice design.

**Done when:** a mission started from the app runs workers in their own worktrees within its
limits and ends with one draft pull request for the person to review; a memory proposed by an
agent reaches new sessions only after approval; a decision can be answered by voice.

## 6. Multi-machine sync over SSH

Remote boxes and containers next to your local sessions.

- `solonaut bridge` over SSH stdio, using the person's own SSH config.
- Remote sessions and items in every client, with their machine.
- Actions routed to the owning core and validated there.

From the workshop: the relay and mobile ideas, of which this is the open-source base.

**Done when:** sessions on a remote box show up in the local app within seconds; an answer
given locally reaches a remote session; a machine going offline and coming back loses no
events.

A hosted, end-to-end encrypted relay for phones and for people without SSH is a possibility
after this stage: optional, paid, in a separate repo with its own license. It is not a promise.

## 7. More platforms and in-session mods

On demand, as people ask for them.

- Platform adapters beyond Herdr (focus and open first, deeper mods where the platform allows).
- Claude Code in-session mods, such as an inbox band inside the session you are looking at.
- Agent adapters for agents other than Claude Code.

From the workshop: running sessions in other terminals, and themes.

**Done when:** each new adapter passes the shared adapter test suite from `sdk/`, and at least
one adapter lives in its own repo, built only on `sdk/`.
