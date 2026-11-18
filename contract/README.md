# contract

The protocol between the core and its clients, and the **only thing the pieces share**.

What will live here:

- `schemas/`: JSON Schemas (draft 2020-12) for every request, response and event;
- `fixtures/`: golden examples, synthetic only, that clients test against without a running core;
- `CHANGELOG.md`: what changed in each contract version.

## Rules

- **Versioned on its own**, as `MAJOR.MINOR`, separately from any binary.
  - Additive changes (a new field, event, request or capability) bump the minor.
  - Anything a client could break on (a removed or renamed field, a changed type or meaning)
    bumps the major and needs an ADR in [`docs/adr/`](../docs/adr/).
  - Until the first release there is one unreleased version, and additions are only logged.
- **Clients ignore what they don't know.** Unknown fields, events and capabilities are never an
  error.
- **Ask, then degrade.** A client reads the core's capabilities in the handshake and shows an
  empty state for anything missing, instead of breaking.
- **One writer per item.** The core owns every record; clients send requests, never files.

Status: empty. Stage 1 of the [roadmap](../ROADMAP.md).
