# Security policy

solonaut runs on your machine next to coding agents. Its plugin can relay and answer permission
prompts, its core reads session transcripts, and its sync can reach other machines over SSH, so
security reports matter here.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:

1. Go to https://github.com/solonaut-run/solonaut/security/advisories/new
2. Describe the issue, how to reproduce it and what an attacker could do.

Only the maintainers see the report. You will get an answer within 7 days. We will agree on a
disclosure date with you and credit you in the advisory unless you prefer not to be named.

## Supported versions

solonaut has no release yet. Until 1.0, only the latest release gets security fixes.

## Scope

In scope: anything that lets a client, plugin, adapter or remote machine

- approve an action it should not, or cross a gate (merge, release, deploy);
- reach the core service without being the local user or an SSH-authenticated peer;
- leak data off the machine, or read or write outside solonaut's own directories;
- read secrets solonaut keeps in the OS keychain.

Out of scope: issues in Claude Code, Herdr or other platforms themselves (report those upstream).
