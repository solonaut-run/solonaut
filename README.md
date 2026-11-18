# solonaut

**One developer. Many Claude Code agents. One control center.**

> **Status: early, pre-release.** Nothing here is ready to install yet. The repo holds the
> vision, the architecture and the skeleton; pieces land one by one as they are finished.
> Follow the [roadmap](ROADMAP.md) to see where things stand.

## What it is

solonaut is an open-source, local-first toolkit for a developer who runs many coding agents at
once. It gives you one place to see and steer all of them, **whatever terminal or machine they
run in**:

- every session, what it is doing and what it costs;
- everything that waits on you (permission prompts, decisions, findings) in one inbox, answered
  without hunting for the right terminal;
- work handed to agents in their own worktrees, with limits and gates they never cross.

It integrates at the **agent layer**, not the terminal layer: a Claude Code plugin is the sensor
and the actuator, so it works the same in Herdr, iTerm, tmux, VS Code, a container or a remote
box over SSH. Terminal apps get optional adapters for things like "focus this session".

Nothing leaves your machine unless you configure it. There is no telemetry.

## Read more

- [Vision](docs/vision.md): what solonaut is for, and the principles it keeps.
- [Architecture](docs/architecture.md): the core service, the protocol, the clients and the adapters.
- [Roadmap](ROADMAP.md): the stages, in order, and when each one is done.

## Repo layout

| Path | What will live there |
|---|---|
| [`core/`](core/) | The core: a local service that owns all state, plus the `solonaut` CLI |
| [`contract/`](contract/) | The protocol and its schemas: the only thing the pieces share |
| [`plugin/`](plugin/) | The Claude Code plugin: hooks and MCP tools |
| [`app/`](app/) | The desktop app (Tauri + React): the control tower |
| [`platforms/herdr/`](platforms/herdr/) | The first platform adapter and its mods, for Herdr |
| [`sdk/`](sdk/) | Client libraries for adapters that live in their own repos |
| [`docs/`](docs/) | Vision, architecture and decision records |
| [`scripts/`](scripts/) | Repo tooling, including the safety guard |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Commits need a DCO sign-off (`git commit -s`). Be kind:
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md), never a
public issue.

```sh
bun install       # Bun 1.4+
bun run setup     # installs the pre-push safety guard
bun run check     # safety guard + typecheck + tests
```

## License

[MIT](LICENSE).
