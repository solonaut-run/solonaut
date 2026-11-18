import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

const folders = ["core", "contract", "plugin", "app", "platforms", "platforms/herdr", "sdk", "docs", "docs/adr", "scripts"];

test.each(folders)("%s has a README", (folder) => {
  expect(existsSync(join(root, folder, "README.md"))).toBe(true);
});

function trackedMarkdown(): string[] {
  const r = Bun.spawnSync(["git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "*.md"], { stdout: "pipe" });
  return r.stdout.toString().split("\0").filter((f) => f && !f.startsWith("node_modules/"));
}

describe("relative links in Markdown resolve", () => {
  const files = trackedMarkdown();
  test("there are Markdown files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });
  test.each(files)("%s", (file) => {
    const text = readFileSync(join(root, file), "utf8").replace(/```[\s\S]*?```/g, "");
    const broken: string[] = [];
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]!;
      if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
      const path = target.split("#")[0]!;
      if (!existsSync(join(root, dirname(file), path))) broken.push(target);
    }
    expect(broken).toEqual([]);
  });
});
