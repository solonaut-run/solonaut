# scripts

Repo tooling. Nothing here ships to users.

| Script | What |
|---|---|
| `safety-guard.ts` | Blocks secrets, personal paths and e-mails, public IPs and denylisted words, in files and commit metadata (`bun run safety`, `bun run safety:history`) |
| `image-guard.ts` | Reads the text in images with OCR (tesseract) and runs the safety guard's scanner over it (`image-guard` workflow) |
| `text-guard.ts` | Runs the safety guard's scanner over issue, pull request and discussion text on GitHub, and takes down the maintainers' and bots' text on a finding (`text-guard` workflows) |
| `install-hooks.ts` | Installs the pre-push safety guard (`bun run setup`) |
| `skeleton.test.ts` | Every top-level folder has a README, and relative links in Markdown files resolve |
