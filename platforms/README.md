# platforms

Optional **adapters** for the places where sessions run: terminal apps, editors, multiplexers.

solonaut works without any of them. An adapter adds two things through a minimal interface:

- **focus**: bring a given session into view;
- **open**: start a visible session in a folder, with a command.

Where a platform allows more, an adapter may also ship deeper mods (panels, key bindings,
status). Without an adapter, solonaut copies the command or opens the default terminal.

Adapters talk to the core only through [`contract/`](../contract/). Adapters for other
platforms can live in their own repos, built on [`sdk/`](../sdk/).

| Folder | Platform | Status |
|---|---|---|
| [`herdr/`](herdr/) | Herdr | Stage 3 of the [roadmap](../ROADMAP.md) |
