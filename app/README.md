# app

The **desktop app**: solonaut's control tower, for macOS, Windows and Linux (Tauri + React).

What will live here:

- the window that shows every session on every machine, the inbox, costs and settings;
- the setup flow: one reviewable plan, applied with one press, every step undoable;
- signed and notarized packaging.

The app has no terminals of its own for now: to work in a session it asks a platform adapter
to focus it, or opens the default terminal. It has no logic of its own either: it is a client
of the core service, like the CLI.

Status: empty. Stage 4 of the [roadmap](../ROADMAP.md).
