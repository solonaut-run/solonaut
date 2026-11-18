# scripts

Repo tooling. Nothing here ships to users.

| Script | What |
|---|---|
| `safety-guard.ts` | Blocks secrets, personal paths and e-mails, public IPs and denylisted words, in files and commit metadata (`bun run safety`, `bun run safety:history`) |
| `install-hooks.ts` | Installs the pre-push safety guard (`bun run setup`) |
| `skeleton.test.ts` | Every top-level folder has a README, and relative links in Markdown files resolve |
