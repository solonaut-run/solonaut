# plugin

The **Claude Code plugin**: solonaut's sensor and actuator inside every session, whatever
terminal or machine it runs in.

What will live here:

- hooks that report session events to the core (start, prompt, tool use, stop, end) and relay
  permission prompts, falling back to Claude Code's own prompt when the core does not answer;
- the gate guard: merge or push to a default branch, release and deploy are refused for agent
  sessions that are not allowed them;
- MCP tools that let an agent ask a decision, report a finding or update its summary;
- delivery of answers and messages into the session;
- the marketplace manifest, so it installs with `/plugin install`.

The plugin never holds logic of its own: it reports and asks, the core decides. When the core
is not running, the session behaves exactly as it would without solonaut.

Status: empty. Stage 2 of the [roadmap](../ROADMAP.md).
