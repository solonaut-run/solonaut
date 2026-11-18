# core

The heart of solonaut: a **local service** that owns all state, and the `solonaut` CLI.

What will live here:

- the service (`solonaut serve`): one per user and machine, listening on a user-only local
  socket (a Unix domain socket, a named pipe on Windows) and speaking the protocol in
  [`contract/`](../contract/);
- the event log and the state built from it: machines, sessions, repos, inbox items, messages,
  costs, and later missions and workers;
- the safety rules: which actions are gates, which need a second confirmation;
- the sync endpoint that lets another machine's core connect over SSH;
- the CLI, which is a client of the service like any other.

Nothing outside `core/` reads its files. See [docs/architecture.md](../docs/architecture.md).

Status: empty. Stage 1 of the [roadmap](../ROADMAP.md).
