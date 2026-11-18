#!/usr/bin/env bun
// Installs the repo's git hooks (.githooks/, today only pre-push: the safety guard) by
// pointing core.hooksPath at them. Idempotent. `--uninstall` puts git's default back.
//
// Usage: bun run setup [-- --uninstall]
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

function git(args: string[]): { code: number; out: string } {
  const r = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString().trim() };
}

export function hooksPathValue(): string | null {
  const r = git(["config", "--local", "--get", "core.hooksPath"]);
  return r.code === 0 ? r.out : null;
}

if (import.meta.main) {
  const root = git(["rev-parse", "--show-toplevel"]).out;
  if (!root) {
    console.error("install-hooks: not inside a git checkout");
    process.exit(1);
  }
  if (process.argv.includes("--uninstall")) {
    git(["config", "--local", "--unset", "core.hooksPath"]);
    console.log("install-hooks: removed; git uses .git/hooks again");
    process.exit(0);
  }
  const hook = join(root, ".githooks", "pre-push");
  if (!existsSync(hook)) {
    console.error("install-hooks: .githooks/pre-push is missing");
    process.exit(1);
  }
  // Windows checkouts lose the executable bit; git for Windows runs the hook through sh anyway.
  if (process.platform !== "win32") chmodSync(hook, 0o755);
  const current = hooksPathValue();
  if (current && current !== ".githooks") {
    console.error(`install-hooks: core.hooksPath is already "${current}"; leaving it alone. Run the guard by hand: bun run safety:history`);
    process.exit(1);
  }
  git(["config", "--local", "core.hooksPath", ".githooks"]);
  console.log("install-hooks: pre-push safety guard enabled (.githooks/pre-push)");
}
