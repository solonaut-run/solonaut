# sdk

Client libraries for anything that talks to the core: the CLI, the app, the platform adapters
in this repo, and third-party adapters in their own repos.

What will live here:

- a TypeScript client: connect to the local service, the handshake, requests, event
  subscriptions with resume, reconnects;
- types generated from [`contract/`](../contract/);
- the platform adapter interface (focus, open) and test helpers;
- later, an agent adapter interface for agents other than Claude Code.

Status: empty. Stage 1 of the [roadmap](../ROADMAP.md).
