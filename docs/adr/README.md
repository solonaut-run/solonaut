# Architecture decision records

One short file per decision that is hard to reverse or that changes the contract:
`NNNN-short-title.md`, numbered in order, never renumbered. A later ADR supersedes an earlier
one; the earlier one stays, marked "Superseded by NNNN".

Each record has: **Status** (proposed, accepted, superseded), **Context**, **Decision**,
**Consequences** and **Alternatives considered**.

A breaking change to [`contract/`](../../contract/) always needs one.
