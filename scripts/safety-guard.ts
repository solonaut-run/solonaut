#!/usr/bin/env bun
// Public-safety guard. This repo is public from the first commit, so before anything
// leaves the machine (pre-push hook) and on every CI run, this blocks:
//   - secrets (API keys, tokens, private keys)
//   - personal home paths (/Users/<name>, /home/<name>, C:\Users\<name>)
//   - e-mail addresses other than noreply / example ones
//   - public IPv4 literals (private and documentation ranges are fine)
//   - denylisted words: public ones in .safety-guard.json; private ones only in the
//     git-ignored .safety-guard.local.json or the SAFETY_GUARD_WORDS variable
// in the working tree and, with --history, in every blob, author, committer and
// message reachable from HEAD.
//
// Usage: bun scripts/safety-guard.ts [--history] [--root DIR]
// Findings are printed redacted (CI logs are public too). Exit 1 if any.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Rules {
  words: string[];
  hashedWords: string[];
  allowEmails: string[];
  allowHomeNames: string[];
  allowIps: string[];
  skip: string[];
}

export interface Finding {
  where: string;
  line: number;
  rule: string;
  excerpt: string;
}

export const ALLOW_MARKER = "safety-guard: allow";

const SECRETS: [string, RegExp][] = [
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["stripe-live-key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["private-key", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["assigned-secret", /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i],
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const HOME = /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\?Users\\\\?)([A-Za-z0-9._-]+)/g;
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]*\d)/g;

/** A base64 or hex run long enough to be data, not words. */
const BLOB = /[A-Za-z0-9+/=_-]{120,}/g;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function glob(pattern: string, value: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
  return re.test(value);
}

/** Private, loopback, link-local, CGNAT, documentation and special ranges. */
export function isNonPublicIp(parts: number[]): boolean {
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function redact(s: string): string {
  if (s.length <= 6) return `${s[0] ?? ""}***`;
  return `${s.slice(0, 3)}***${s.slice(-2)}`;
}

export function scanText(text: string, where: string, rules: Rules): Finding[] {
  if (text.includes("\0")) return []; // binary
  const plain = new Set(rules.words.map((w) => w.toLowerCase()));
  const hashed = new Set(rules.hashedWords.map((h) => h.toLowerCase()));
  const findings: Finding[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    const add = (rule: string, excerpt: string) => findings.push({ where, line: i + 1, rule, excerpt });
    for (const [rule, re] of SECRETS) {
      const m = line.match(re);
      if (m) add(`secret:${rule}`, redact(m[0]));
    }
    for (const m of line.matchAll(EMAIL)) {
      if (!rules.allowEmails.some((p) => glob(p, m[0]))) add("email", redact(m[0]));
    }
    for (const m of line.matchAll(HOME)) {
      if (!rules.allowHomeNames.includes(m[1]!.toLowerCase())) add("home-path", redact(m[0]));
    }
    for (const m of line.matchAll(IPV4)) {
      const parts = m.slice(1, 5).map(Number);
      if (parts.some((n) => n > 255) || isNonPublicIp(parts) || rules.allowIps.includes(m[0])) continue;
      add("public-ip", redact(m[0]));
    }
    // Inlined fonts and images (base64 runs) are not prose: drop them before the word check.
    // The rest of a long line still counts, so text in a one-line SVG is checked like any other.
    let prose = line.length > 2000 ? line.replace(BLOB, " ") : line;
    // Allowed e-mail addresses are public on purpose: their words don't count as denied words.
    for (const m of line.matchAll(EMAIL)) if (rules.allowEmails.some((p) => glob(p, m[0]))) prose = prose.replace(m[0], " ");
    for (const token of new Set(prose.toLowerCase().split(/[^a-z0-9]+/))) {
      if (!token) continue;
      if (plain.has(token)) add("denied-word", token);
      else if (hashed.has(sha256(token))) add("denied-word", "(private word)");
    }
  });
  return findings;
}

/** Where a private .safety-guard.local.json may live: the checkout, then the main clone of a worktree. */
function fileKey(p: string): string {
  if (!existsSync(p)) return p;
  const st = statSync(p, { bigint: true });
  return st.ino ? `${st.dev}:${st.ino}` : realpathSync(p).toLowerCase();
}

export function localRulePaths(root: string): string[] {
  const paths = [join(root, ".safety-guard.local.json")];
  const r = Bun.spawnSync(["git", "-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode === 0) {
    const common = r.stdout.toString().trim();
    if (common.endsWith("/.git")) paths.push(join(dirname(common), ".safety-guard.local.json"));
  }
  // The same file reached through another spelling of its path counts once: a symlink
  // (/var vs /private/var) or, on Windows, a short 8.3 name (RUNNER~1) that realpath keeps.
  // The file's identity (device + inode) catches both; the path is only a fallback.
  const seen = new Set<string>();
  return paths.filter((p) => {
    const key = fileKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function loadRules(root: string, env: Record<string, string | undefined> = process.env): Rules {
  const base = JSON.parse(readFileSync(join(root, ".safety-guard.json"), "utf8")) as Partial<Rules>;
  const local = localRulePaths(root)
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, "utf8")) as Partial<Rules>);
  // Private plain words (local file or variable) are kept only as hashes, so a finding prints
  // "(private word)" and never the word itself: CI logs are public, and a secret holding a
  // comma-separated list is not masked word by word.
  const extra = (env.SAFETY_GUARD_WORDS ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  const privatePlain = [...local.flatMap((l) => l.words ?? []), ...extra].map((w) => sha256(w.toLowerCase()));
  return {
    allowHomeNames: [],
    allowIps: [],
    skip: [],
    ...base,
    words: base.words ?? [],
    hashedWords: [...(base.hashedWords ?? []), ...local.flatMap((l) => l.hashedWords ?? []), ...privatePlain],
    allowEmails: [...(base.allowEmails ?? []), ...local.flatMap((l) => l.allowEmails ?? [])],
  };
}

function git(root: string, args: string[], input?: string): Buffer {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdin: input ? Buffer.from(input) : undefined, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout;
}

const skipped = (rules: Rules, path: string) => rules.skip.some((p) => glob(p, path));

export function scanWorkingTree(root: string, rules: Rules): Finding[] {
  const files = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).toString().split("\0").filter(Boolean);
  return [...new Set(files)]
    .filter((f) => !skipped(rules, f) && existsSync(join(root, f)))
    .flatMap((f) => scanText(readFileSync(join(root, f), "latin1"), f, rules));
}

export function scanHistory(root: string, rules: Rules): Finding[] {
  const hasHead = Bun.spawnSync(["git", "-C", root, "rev-parse", "--verify", "-q", "HEAD"]).exitCode === 0;
  if (!hasHead) return [];
  const findings: Finding[] = [];
  // Commit metadata: author/committer e-mails and names, and the full message.
  const log = git(root, ["log", "--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x1e"]).toString();
  for (const rec of log.split("\x1e")) {
    const [sha, author, committer, body] = rec.replace(/^\n/, "").split("\0");
    if (!sha) continue;
    findings.push(...scanText([author, committer, body].join("\n"), `commit ${sha.slice(0, 10)}`, rules));
  }
  // Every blob reachable from HEAD, once each (a secret removed later still leaks).
  const objects = git(root, ["rev-list", "--objects", "HEAD"]).toString().split("\n").filter(Boolean);
  const paths = new Map<string, string>();
  for (const line of objects) {
    const sp = line.indexOf(" ");
    if (sp > 0) paths.set(line.slice(0, sp), line.slice(sp + 1));
  }
  const shas = [...paths.keys()];
  const batch = git(root, ["cat-file", "--batch"], `${shas.join("\n")}\n`);
  let off = 0;
  while (off < batch.length) {
    const nl = batch.indexOf(10, off);
    const [sha, type, size] = batch.subarray(off, nl).toString().split(" ");
    const len = Number(size);
    const body = batch.subarray(nl + 1, nl + 1 + len);
    off = nl + 1 + len + 1;
    const path = paths.get(sha!) ?? sha!;
    if (type !== "blob" || skipped(rules, path)) continue;
    findings.push(...scanText(body.toString("latin1"), `${path} @${sha!.slice(0, 10)}`, rules));
  }
  return findings;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root = rootIdx >= 0 ? argv[rootIdx + 1]! : git(process.cwd(), ["rev-parse", "--show-toplevel"]).toString().trim();
  const rules = loadRules(root);
  const findings = [...scanWorkingTree(root, rules), ...(argv.includes("--history") ? scanHistory(root, rules) : [])];
  const seen = new Set<string>();
  for (const f of findings) {
    const key = `${f.where}:${f.line}:${f.rule}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`${f.where}:${f.line}  ${f.rule}  ${f.excerpt}`);
  }
  if (seen.size) {
    console.error(`\nsafety-guard: ${seen.size} finding(s). Fix them, or mark a line with "${ALLOW_MARKER}" and a reason.`);
    process.exit(1);
  }
  console.log(`safety-guard: clean${argv.includes("--history") ? " (working tree + history)" : " (working tree)"}`);
}
