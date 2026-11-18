import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALLOW_MARKER, glob, isNonPublicIp, loadRules, scanHistory, scanText, scanWorkingTree, type Rules } from "./safety-guard";

// Every sample below is assembled at run time, so this file never trips the guard itself.
const j = (...p: string[]) => p.join("");
const at = "@";

const rules: Rules = {
  words: ["retiredname"],
  hashedWords: [createHash("sha256").update("hushword").digest("hex")],
  allowEmails: ["*@users.noreply.github.com", "noreply@*", "*@example.com"],
  allowHomeNames: ["runner"],
  allowIps: [],
  skip: ["skipped.txt"],
};
const rulesOf = (text: string) => scanText(text, "f", rules).map((f) => f.rule);

describe("secrets", () => {
  test.each([
    ["aws", j("AK", "IA", "ABCDEFGHIJKLMNOP")],
    ["github", j("gh", "p_", "a".repeat(36))],
    ["anthropic", j("sk-", "ant-", "x".repeat(24))],
    ["private key", j("-----BEGIN ", "RSA PRIVATE", " KEY-----")],
    ["assignment", j("api_key", " = '", "z9".repeat(10), "'")],
  ])("%s", (_, sample) => {
    expect(rulesOf(sample).some((r) => r.startsWith("secret:"))).toBe(true);
  });

  test("findings are redacted", () => {
    const secret = j("gh", "p_", "b".repeat(36));
    const [f] = scanText(secret, "f", rules);
    expect(f!.excerpt).not.toContain("bbbbbbbb");
  });
});

describe("emails", () => {
  test("real addresses are blocked, noreply and example ones pass", () => {
    expect(rulesOf(j("me", at, "personal-domain.io"))).toEqual(["email"]);
    expect(rulesOf(j("1+me", at, "users.noreply.github.com"))).toEqual([]);
    expect(rulesOf(j("noreply", at, "anything.com"))).toEqual([]);
    expect(rulesOf(j("a", at, "example.com"))).toEqual([]);
  });

  test("an allowed address doesn't trip the word check with its own words", () => {
    const own = { ...rules, allowEmails: [...rules.allowEmails, j("me", at, "hushword.com")] };
    expect(scanText(j("Author: Me <me", at, "hushword.com>"), "f", own).map((f) => f.rule)).toEqual([]);
    expect(scanText("the hushword in prose", "f", own).map((f) => f.rule)).toEqual(["denied-word"]);
  });

  test("package specifiers are not e-mails", () => {
    expect(rulesOf(j("react", at, "18.3.1 and ", at, "types/bun"))).toEqual([]);
  });
});

describe("home paths", () => {
  test("named homes are blocked, placeholders and CI pass", () => {
    expect(rulesOf(j("/Us", "ers/alice/code"))).toEqual(["home-path"]);
    expect(rulesOf(j("/ho", "me/bob/.config"))).toEqual(["home-path"]);
    expect(rulesOf(j("C:\\Us", "ers\\carol\\x"))).toEqual(["home-path"]);
    expect(rulesOf(j("/ho", "me/runner/work"))).toEqual([]);
    expect(rulesOf(j("/Us", "ers/<name>/x and ~/.config"))).toEqual([]);
  });
});

describe("ip addresses", () => {
  test("public literals are blocked, private and documentation ranges pass", () => {
    expect(rulesOf(j("8.8", ".8.8"))).toEqual(["public-ip"]);
    for (const ip of ["10.0.0.1", "192.168.1.10", "127.0.0.1", "172.20.0.1", "100.64.0.1", "203.0.113.5", "0.0.0.0"]) {
      expect(rulesOf(ip)).toEqual([]);
    }
    expect(rulesOf("version 1.2.3.4.5")).toEqual([]);
    expect(rulesOf("999.1.1.1")).toEqual([]);
  });

  test("isNonPublicIp", () => {
    expect(isNonPublicIp([172, 15, 0, 1])).toBe(false);
    expect(isNonPublicIp([172, 31, 0, 1])).toBe(true);
  });
});

describe("words", () => {
  test("plain and hashed words match whole tokens, any case", () => {
    expect(rulesOf("see RetiredName here")).toEqual(["denied-word"]);
    expect(rulesOf("the hushword.example")).toEqual(["denied-word"]);
    expect(rulesOf("hushwords")).toEqual([]);
  });

  test("hashed words are never printed", () => {
    expect(scanText("hushword", "f", rules)[0]!.excerpt).toBe("(private word)");
  });
});

test("allow marker silences one line", () => {
  expect(rulesOf(`retiredname // ${ALLOW_MARKER}: naming rule\nretiredname`)).toEqual(["denied-word"]);
});

test("binary content is skipped", () => {
  expect(rulesOf(`retiredname\0`)).toEqual([]);
});

test("glob", () => {
  expect(glob("*@example.com", j("a", at, "Example.com"))).toBe(true);
  expect(glob("design/fonts/*", "design/fonts/a.woff2")).toBe(true);
  expect(glob("noreply@*", j("x", at, "noreply"))).toBe(false);
});

describe("git scans", () => {
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "guard-"));
    const g = (...a: string[]) => {
      const r = Bun.spawnSync(["git", "-C", dir, ...a], { stderr: "pipe" });
      if (r.exitCode !== 0) throw new Error(r.stderr.toString());
    };
    g("init", "-q", "-b", "main");
    g("config", "user.name", "Test");
    g("config", "user.email", j("1+t", at, "users.noreply.github.com"));
    g("config", "commit.gpgsign", "false");
    return { dir, g };
  }

  test("working tree: tracked and untracked files, skip list honoured", () => {
    const { dir } = repo();
    writeFileSync(join(dir, "a.md"), "retiredname\n");
    writeFileSync(join(dir, "skipped.txt"), "retiredname\n");
    expect(scanWorkingTree(dir, rules).map((f) => f.where)).toEqual(["a.md"]);
  });

  test("history: a word removed later and a bad author e-mail are both found", () => {
    const { dir, g } = repo();
    writeFileSync(join(dir, "a.md"), "hushword\n");
    g("add", ".");
    g("commit", "-q", "-m", "first");
    writeFileSync(join(dir, "a.md"), "clean\n");
    g("add", ".");
    g("-c", `user.email=${j("dev", at, "company.io")}`, "commit", "-q", "-m", "second");
    expect(scanWorkingTree(dir, rules)).toEqual([]);
    const found = scanHistory(dir, rules).map((f) => f.rule).sort();
    expect(found).toEqual(["denied-word", "email", "email"]);
  });

  test("history: an allowed address passes in author, committer and sign-off; its private word elsewhere does not", () => {
    const own = j("me", at, "hushword.com");
    const ownRules = { ...rules, allowEmails: [...rules.allowEmails, own] };
    const { dir, g } = repo();
    g("config", "user.email", own);
    writeFileSync(join(dir, "a.md"), `Contact: ${own}\n`);
    g("add", ".");
    g("commit", "-q", "-m", `first\n\nSigned-off-by: Me <${own}>`);
    expect(scanHistory(dir, ownRules)).toEqual([]);
    expect(scanWorkingTree(dir, ownRules)).toEqual([]);

    writeFileSync(join(dir, "b.md"), `see hushword.com and ${j("other", at, "hushword.com")}\n`);
    g("add", ".");
    g("commit", "-q", "-m", "second: the hushword team");
    const found = scanHistory(dir, ownRules).map((f) => `${f.where.split(" ")[0]} ${f.rule}`).sort();
    expect(found).toEqual(["b.md denied-word", "b.md email", "commit denied-word"]);
  });
});

describe("loadRules", () => {
  const hush = createHash("sha256").update("hushword").digest("hex");
  function clone() {
    const dir = mkdtempSync(join(tmpdir(), "guard-rules-"));
    const g = (...a: string[]) => {
      const r = Bun.spawnSync(["git", "-C", dir, ...a], { stderr: "pipe" });
      if (r.exitCode !== 0) throw new Error(r.stderr.toString());
    };
    g("init", "-q", "-b", "main");
    g("config", "user.name", "Test");
    g("config", "user.email", j("1+t", at, "users.noreply.github.com"));
    g("config", "commit.gpgsign", "false");
    // The public file carries no private words, not even hashed.
    writeFileSync(join(dir, ".safety-guard.json"), JSON.stringify({ words: ["retiredname"], allowEmails: [], allowHomeNames: [], allowIps: [], skip: [] }));
    g("add", ".");
    g("commit", "-q", "-m", "init");
    return { dir, g };
  }

  test("public rules alone: no private words", () => {
    const { dir } = clone();
    const r = loadRules(dir, {});
    expect(r.words).toEqual(["retiredname"]);
    expect(r.hashedWords).toEqual([]);
  });

  test("private words come from the local file and the variable", () => {
    const { dir } = clone();
    writeFileSync(join(dir, ".safety-guard.local.json"), JSON.stringify({ hashedWords: [hush] }));
    const r = loadRules(dir, { SAFETY_GUARD_WORDS: "secretname, Other" });
    expect(r.words).toEqual(["retiredname"]);
    expect(r.hashedWords).toHaveLength(3);
    expect(scanText("hushword", "f", r).map((f) => f.excerpt)).toEqual(["(private word)"]);
  });

  test("private plain words are matched but never printed", () => {
    const { dir } = clone();
    writeFileSync(join(dir, ".safety-guard.local.json"), JSON.stringify({ words: ["localname"] }));
    const r = loadRules(dir, { SAFETY_GUARD_WORDS: "envname" });
    expect(r.words).toEqual(["retiredname"]);
    const found = scanText("a LocalName and an envname", "f", r);
    expect(found.map((f) => f.rule)).toEqual(["denied-word", "denied-word"]);
    expect(found.every((f) => f.excerpt === "(private word)")).toBe(true);
  });

  test("a worktree also reads the local file of its main clone", () => {
    const { dir, g } = clone();
    writeFileSync(join(dir, ".safety-guard.local.json"), JSON.stringify({ hashedWords: [hush] }));
    const wt = join(mkdtempSync(join(tmpdir(), "guard-wt-")), "wt");
    g("worktree", "add", "-q", "-b", "side", wt);
    expect(loadRules(wt, {}).hashedWords).toEqual([hush]);
  });
});
